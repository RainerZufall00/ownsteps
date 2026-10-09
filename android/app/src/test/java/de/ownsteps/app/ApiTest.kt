package de.ownsteps.app

import de.ownsteps.app.api.ApiError
import de.ownsteps.app.api.ApiJson
import de.ownsteps.app.api.AppVersion
import de.ownsteps.app.api.ChangeFeed
import de.ownsteps.app.api.Comment
import de.ownsteps.app.api.ImmichConnection
import de.ownsteps.app.api.ImmichStatus
import de.ownsteps.app.api.Info
import de.ownsteps.app.api.Invite
import de.ownsteps.app.api.OidcCallback
import de.ownsteps.app.api.Photo
import de.ownsteps.app.api.Pkce
import de.ownsteps.app.api.ServerAddress
import de.ownsteps.app.api.ServerClient
import de.ownsteps.app.api.Share
import de.ownsteps.app.api.Step
import de.ownsteps.app.api.StepPatch
import de.ownsteps.app.api.Trip
import de.ownsteps.app.api.TripDetail
import de.ownsteps.app.api.TripFields
import de.ownsteps.app.api.Viewer
import de.ownsteps.app.api.ViewerToken
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.OkHttpClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.File
import java.time.Instant

class ServerAddressTest {
    private fun normalize(input: String) = ServerAddress.normalize(input).toString()

    private fun problem(input: String) = try {
        ServerAddress.normalize(input)
        null
    } catch (error: ServerAddress.Invalid) {
        error.problem
    }

    @Test fun `adds https and a trailing slash`() = assertEquals("https://trips.example.com/", normalize(" Trips.Example.com "))

    @Test fun `keeps a path prefix`() = assertEquals("https://example.com/ownsteps/", normalize("https://example.com/ownsteps/"))

    @Test fun `cuts a pasted share link down to the server`() =
        assertEquals("https://trips.example.com/", normalize("https://trips.example.com/s/abc123?x=1#step-4"))

    @Test fun `drops credentials`() = assertEquals("https://trips.example.com/", normalize("https://user:pw@trips.example.com/trips/3"))

    @Test fun `allows plain http only locally`() {
        assertEquals("http://192.168.1.20:2555/", normalize("http://192.168.1.20:2555"))
        assertEquals("http://10.0.2.2:2555/", normalize("http://10.0.2.2:2555"))
        assertEquals("http://nas.local/", normalize("http://nas.local"))
        assertEquals(ServerAddress.Problem.INSECURE, problem("http://trips.example.com"))
        assertEquals(ServerAddress.Problem.INSECURE, problem("http://10.0.0.1.example.com"))
        assertEquals(ServerAddress.Problem.INSECURE, problem("http://172.32.0.1"))
    }

    @Test fun `rejects nonsense`() {
        assertEquals(ServerAddress.Problem.EMPTY, problem("  "))
        assertEquals(ServerAddress.Problem.INVALID, problem("ftp://example.com"))
        assertEquals(ServerAddress.Problem.INVALID, problem("https://"))
    }
}

class InviteTest {
    @Test fun `reads ownsteps join links`() {
        val invite = Invite.from("ownsteps://join?url=https%3A%2F%2Ftrips.example.com%2Fs%2Fabc")!!
        assertEquals("https://trips.example.com/s/abc", invite.shareLink)
        assertEquals("https://trips.example.com/", invite.serverUrl.toString())
    }

    @Test fun `reads pasted links with or without scheme`() {
        assertEquals("https://trips.example.com/", Invite.fromText("trips.example.com/s/abc")!!.serverUrl.toString())
        assertEquals("https://example.com/sub/", Invite.from("https://example.com/sub/s/xyz")!!.serverUrl.toString())
    }

    @Test fun `only share links invite`() {
        assertNull(Invite.from("https://trips.example.com/"))
        assertNull(Invite.from("https://trips.example.com/s/"))
        assertNull(Invite.from("ownsteps://auth?code=1"))
        assertNull(Invite.fromText(""))
    }
}

class OidcTest {
    @Test fun `challenge is the S256 of the verifier`() {
        // RFC 7636, appendix B.
        assertEquals("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", Pkce("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk").challenge)
        assertEquals(43, Pkce.generate().verifier.length)
    }

    @Test fun `takes the code only with the right state`() {
        assertEquals("c0de", OidcCallback.code("ownsteps://auth?code=c0de&state=s1", "s1"))
        expect<OidcCallback.Problem.Mismatch> { OidcCallback.code("ownsteps://auth?code=c0de&state=other", "s1") }
        expect<OidcCallback.Problem.Mismatch> { OidcCallback.code("ownsteps://join?code=c0de&state=s1", "s1") }
        val failed = expect<OidcCallback.Problem.Failed> { OidcCallback.code("ownsteps://auth?error=oidc_not_allowed&state=s1", "s1") }
        assertEquals("oidc_not_allowed", failed.reason)
        assertTrue(OidcCallback.isCallback("ownsteps://auth?x"))
        assertFalse(OidcCallback.isCallback("ownsteps://join?url=x"))
    }

    @Test fun `compares versions part by part`() {
        assertTrue(AppVersion("1.0.0") >= AppVersion("1.0"))
        assertTrue(AppVersion("1.10.0") > AppVersion("1.9.3"))
        assertTrue(AppVersion("0.9") < AppVersion("1.0.0"))
    }
}

/** The models against the server's own API description, so a change there shows up here. */
class ContractTest {
    private val schemas: JsonObject by lazy {
        val file = File("../../ios/Packages/OwnStepsKit/Sources/OwnStepsAPI/openapi.json")
        Json.parseToJsonElement(file.readText()).jsonObject["components"]!!.jsonObject["schemas"]!!.jsonObject
    }

    private fun properties(schema: String): Set<String> = schemas[schema]!!.jsonObject["properties"]!!.jsonObject.keys

    private fun check(serializer: KSerializer<*>, schema: String, except: Set<String> = emptySet()) {
        val descriptor = serializer.descriptor
        val ours = (0 until descriptor.elementsCount).map(descriptor::getElementName).toSet() - except
        val missing = ours - properties(schema)
        assertTrue("$schema has no $missing", missing.isEmpty())
    }

    @Test fun `every field the app reads exists in the API`() {
        check(Info.serializer(), "Info")
        check(Trip.serializer(), "Trip")
        check(Step.serializer(), "Step")
        check(Photo.serializer(), "Photo")
        check(Comment.serializer(), "Comment")
        check(Share.serializer(), "Share")
        check(Viewer.serializer(), "Viewer")
        check(ViewerToken.serializer(), "ViewerToken")
        check(ImmichConnection.serializer(), "ImmichConnection")
        check(ImmichStatus.serializer(), "ImmichStatus")
        check(ChangeFeed.serializer(), "ChangeFeed")
        check(ChangeFeed.Change.serializer(), "Change")
        check(TripFields.serializer(), "TripPatch")
        check(StepPatch.serializer(), "StepPatch")
    }

    @Test fun `trip detail keeps the trip and its steps apart and round-trips`() {
        val json = """
            {"id":7,"title":"Norway","summary":null,"startDate":"2026-07-01","endDate":null,"coverPhotoId":null,
             "stepCount":1,"photoCount":0,"firstStepAt":"2026-07-01T08:30:00.000Z","lastStepAt":"2026-07-01T08:30:00.000Z",
             "updatedAt":"2026-07-02T10:00:00.000+02:00","newField":true,
             "steps":[{"id":1,"tripId":7,"clientUuid":null,"body":"Hi","placeName":"Bergen","countryCode":"no",
                       "lat":60.39,"lon":5.32,"occurredAt":"2026-07-01T08:30:00.000Z","updatedAt":"2026-07-01T08:30:00.000Z",
                       "photos":[],"comments":[]}]}
        """
        val detail = ApiJson.decodeFromString(TripDetail.serializer(), json)
        assertEquals("Norway", detail.trip.title)
        assertEquals(Instant.parse("2026-07-02T08:00:00Z"), detail.trip.updatedAt)
        assertEquals("Bergen", detail.steps.single().placeName)
        assertEquals(detail, ApiJson.decodeFromString(TripDetail.serializer(), ApiJson.encodeToString(TripDetail.serializer(), detail)))
    }

    @Test fun `patches leave out what they don't change`() {
        assertEquals("""{"shareEnabled":true}""", ApiJson.encodeToString(TripFields(shareEnabled = true)))
        assertEquals("""{"placeName":""}""", ApiJson.encodeToString(StepPatch(placeName = "")))
    }
}

class ServerClientTest {
    @Test fun `sends the token and turns problem documents into errors`() = runTest {
        MockWebServer().use { server ->
            server.enqueue(MockResponse.Builder().code(404).addHeader("Content-Type", "application/problem+json")
                .body("""{"type":"urn:ownsteps:problem:trip_not_found","title":"Not found","status":404,"code":"trip_not_found"}""").build())
            server.start()
            val client = ServerClient(server.url("/base/"), "osa_secret", OkHttpClient())
            val error = try {
                client.trip(3)
                null
            } catch (error: ApiError) {
                error
            }
            assertEquals(ApiError.Problem("trip_not_found", 404), error)
            val request = server.takeRequest()
            assertEquals("/base/api/v1/trips/3", request.url.encodedPath)
            assertEquals("Bearer osa_secret", request.headers["Authorization"])
        }
    }

    @Test fun `a web page is not an OwnSteps server`() = runTest {
        MockWebServer().use { server ->
            server.enqueue(MockResponse.Builder().body("<html>hello</html>").build())
            server.start()
            try {
                ServerClient(server.url("/"), null, OkHttpClient()).info("1.0.0")
                fail()
            } catch (error: ApiError) {
                assertEquals(ApiError.NotOwnSteps, error)
            }
        }
    }

    @Test fun `refuses servers that need a newer app`() = runTest {
        MockWebServer().use { server ->
            server.enqueue(MockResponse.Builder().body(
                """{"name":"X","version":"9.0.0","apiVersion":1,"minAppVersion":"2.0.0","setupComplete":true,"timeZone":"Europe/Berlin",
                    "auth":{"password":true,"oidc":false,"oidcLabel":null},"features":[]}""",
            ).build())
            server.start()
            try {
                ServerClient(server.url("/"), null, OkHttpClient()).info("1.0.0")
                fail()
            } catch (error: ApiError) {
                assertEquals(ApiError.Incompatible("9.0.0"), error)
            }
        }
    }
}

inline fun <reified T : Throwable> expect(block: () -> Unit): T {
    try {
        block()
    } catch (error: Throwable) {
        if (error is T) return error
        throw error
    }
    fail("Expected ${T::class.simpleName}")
    throw IllegalStateException()
}
