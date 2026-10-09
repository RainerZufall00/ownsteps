package de.ownsteps.app.api

import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import java.net.URI
import java.net.URLDecoder
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/**
 * Turns whatever someone types or pastes into the base URL of an OwnSteps
 * server: "trips.example.com", "https://trips.example.com/", or a whole
 * share link like "https://trips.example.com/s/abc". The result always
 * ends in "/", so API paths resolve against it.
 */
object ServerAddress {
    enum class Problem { EMPTY, INVALID, INSECURE }

    class Invalid(val problem: Problem) : Exception(problem.name)

    private val pageMarkers = listOf("/s/", "/trips/", "/api/", "/login", "/settings")

    fun normalize(input: String): HttpUrl {
        var text = input.trim()
        if (text.isEmpty()) throw Invalid(Problem.EMPTY)
        if (!text.contains("://")) text = "https://$text"
        val url = text.toHttpUrlOrNull() ?: throw Invalid(Problem.INVALID)
        // Plain HTTP only inside the local network ([D26]).
        if (!url.isHttps && !isLocal(url.host)) throw Invalid(Problem.INSECURE)

        // A pasted share link or page: keep only what precedes /s/, /trips/ …
        var path = url.encodedPath
        for (marker in pageMarkers) {
            val index = path.indexOf(marker)
            if (index >= 0) path = path.substring(0, index)
        }
        return url.newBuilder()
            .encodedPath(path.trimEnd('/') + "/")
            .query(null)
            .fragment(null)
            .username("")
            .password("")
            .build()
    }

    /** localhost, .local names and private IPv4 addresses (incl. the emulator's 10.0.2.2). */
    fun isLocal(host: String): Boolean {
        val name = host.lowercase()
        if (name == "localhost" || name.endsWith(".local") || name == "::1") return true
        // Every part must be a number: "10.0.0.1.example.com" is a public name.
        val parts = name.split(".").map { it.toIntOrNull() }
        if (parts.size != 4 || parts.any { it == null }) return false
        val (a, b) = parts[0]!! to parts[1]!!
        return a == 10 || a == 127 || (a == 192 && b == 168) || (a == 169 && b == 254) || (a == 172 && b in 16..31)
    }
}

/** The query of a URI like `ownsteps://auth?code=…`, decoded. */
private fun queryOf(uri: URI): Map<String, String> =
    uri.rawQuery.orEmpty().split("&").filter { it.isNotEmpty() }.associate { pair ->
        val name = pair.substringBefore("=")
        val value = pair.substringAfter("=", "")
        URLDecoder.decode(name, "UTF-8") to URLDecoder.decode(value, "UTF-8")
    }

private fun parseUri(text: String): URI? = runCatching { URI(text) }.getOrNull()

/**
 * An invitation to follow a trip ([D18]): the trip's share link, as it comes
 * from `ownsteps://join?url=…`, a pasted link or a scanned QR code. The
 * server is wherever the link points, minus `/s/<token>`.
 */
data class Invite(val shareLink: String, val serverUrl: HttpUrl) {
    companion object {
        fun from(link: String): Invite? {
            val uri = parseUri(link) ?: return null
            if (uri.scheme == OidcCallback.SCHEME) {
                if (uri.host != "join") return null
                return queryOf(uri)["url"]?.let(::shareLink)
            }
            return shareLink(link)
        }

        /** What the user pasted – with or without `https://`. */
        fun fromText(text: String): Invite? {
            val trimmed = text.trim()
            if (trimmed.isEmpty()) return null
            return from(if (trimmed.contains("://")) trimmed else "https://$trimmed")
        }

        private fun shareLink(link: String): Invite? {
            // Only a share link invites; a bare server address doesn't.
            val path = link.toHttpUrlOrNull()?.encodedPath ?: return null
            val index = path.indexOf("/s/")
            if (index < 0 || path.length <= index + 3) return null
            val server = runCatching { ServerAddress.normalize(link) }.getOrNull() ?: return null
            return Invite(link, server)
        }
    }
}

/**
 * PKCE between the app and its server: the one-time code that comes back
 * through `ownsteps://auth` is worthless without the verifier, which never
 * leaves the app ([D14]).
 */
data class Pkce(val verifier: String) {
    val challenge: String get() = base64Url(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray()))

    companion object {
        /** 32 random bytes → 43 characters, the minimum RFC 7636 allows. */
        fun generate() = Pkce(randomToken())

        fun randomToken(): String = base64Url(ByteArray(32).also(SecureRandom()::nextBytes))

        private fun base64Url(bytes: ByteArray): String = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }
}

/** The end of the OIDC sign-in: `ownsteps://auth?code=…&state=…` or `?error=…&state=…`. */
object OidcCallback {
    const val SCHEME = "ownsteps"

    sealed class Problem : Exception() {
        /** Not our callback, or the state doesn't match the one we sent. */
        data object Mismatch : Problem()
        /** The server says why sign-in failed (e.g. `oidc_not_allowed`). */
        data class Failed(val reason: String) : Problem()
    }

    fun isCallback(link: String) = parseUri(link)?.let { it.scheme == SCHEME && it.host == "auth" } == true

    fun code(link: String, expectedState: String): String {
        val uri = parseUri(link)?.takeIf { it.scheme == SCHEME && it.host == "auth" } ?: throw Problem.Mismatch
        val query = queryOf(uri)
        if (query["state"] != expectedState) throw Problem.Mismatch
        query["error"]?.let { throw Problem.Failed(it) }
        return query["code"]?.takeIf { it.isNotEmpty() } ?: throw Problem.Mismatch
    }
}

/** "1.2.3" compared part by part; missing parts count as 0. */
data class AppVersion(val parts: List<Int>) : Comparable<AppVersion> {
    constructor(text: String) : this(text.split(".").map { it.toIntOrNull() ?: 0 })

    override fun compareTo(other: AppVersion): Int {
        for (index in 0 until maxOf(parts.size, other.parts.size)) {
            val difference = parts.getOrElse(index) { 0 } - other.parts.getOrElse(index) { 0 }
            if (difference != 0) return difference
        }
        return 0
    }
}
