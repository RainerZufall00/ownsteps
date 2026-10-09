package de.ownsteps.app

import android.content.Context
import android.os.Build
import android.provider.Settings
import de.ownsteps.app.api.ApiError
import de.ownsteps.app.api.ApiJson
import de.ownsteps.app.api.AuthorToken
import de.ownsteps.app.api.Info
import de.ownsteps.app.api.Invite
import de.ownsteps.app.api.OidcCallback
import de.ownsteps.app.api.Pkce
import de.ownsteps.app.api.ServerAddress
import de.ownsteps.app.api.ServerClient
import de.ownsteps.app.data.Account
import de.ownsteps.app.data.AccountStore
import de.ownsteps.app.api.TripDetail
import de.ownsteps.app.data.AppDatabase
import de.ownsteps.app.data.PhotoSuggestions
import de.ownsteps.app.data.PhotoCache
import de.ownsteps.app.data.Prefs
import de.ownsteps.app.data.TokenStore
import de.ownsteps.app.data.TripCache
import de.ownsteps.app.data.TripNews
import de.ownsteps.app.data.UploadQueue
import de.ownsteps.app.media.Library
import de.ownsteps.app.media.LibraryItem
import de.ownsteps.app.media.MediaPreparation
import de.ownsteps.app.work.Notifications
import de.ownsteps.app.work.UploadWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import java.io.File
import java.util.concurrent.TimeUnit

/** A server that answered `/api/v1/info` and waits for someone to sign in. */
@Serializable
data class PendingServer(val url: String, val info: Info) {
    val baseUrl: HttpUrl get() = url.toHttpUrl()
}

/** A trip to show, e.g. after tapping a notification; [stepId] is opened on arrival. */
data class TripRoute(val accountId: String, val tripId: Long, val stepId: Long? = null)

/** Where an OIDC sign-in in the browser stands, for the sign-in screen. */
sealed interface OidcState {
    data object Idle : OidcState
    data object Running : OidcState
    data class Failed(val error: Throwable) : OidcState
}

/**
 * The app's state and services – one per process, created by
 * [OwnStepsApplication]: which servers it's signed in to, the offline copy,
 * the upload queue. Screens and workers reach everything through it.
 */
class AppModel(private val context: Context) {
    val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        // Large videos on slow lines: the body is streamed from disk.
        .writeTimeout(0, TimeUnit.SECONDS)
        .addNetworkInterceptor { chain ->
            chain.proceed(chain.request().newBuilder().header("User-Agent", "OwnSteps-Android/${BuildConfig.VERSION_NAME}").build())
        }
        .build()

    val prefs = Prefs(context)
    private val accountStore = AccountStore(context)
    private val tokens = TokenStore(context)
    private val database = AppDatabase.open(context)
    val accounts = accountStore.accounts
    val cache = TripCache(database.cache())
    val photos = PhotoCache(File(context.filesDir, "media"), http)
    val uploads = UploadQueue(database.queue(), File(context.filesDir, "uploads"), clientFor = { id -> account(id)?.let(::client) })
    val media = MediaPreparation(context)

    /** Work that outlives a screen, like signing out on the server. */
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    /** Shown once on the welcome screen, e.g. after the server revoked the token. */
    val notice = MutableStateFlow<String?>(null)
    /** An invitation to follow a trip, from `ownsteps://join` ([D18]). */
    val pendingInvite = MutableStateFlow<Invite?>(null)
    /** A trip to open, e.g. from a notification. */
    val openTrip = MutableStateFlow<TripRoute?>(null)
    /** The server picked on the welcome screen, waiting for sign-in. */
    val pendingServer = MutableStateFlow<PendingServer?>(null)
    val oidc = MutableStateFlow<OidcState>(OidcState.Idle)
    /** Bumped when a trip changed in a way its card shows; the trip list loads again. */
    val tripListRevision = MutableStateFlow(0)

    val appVersion: String = BuildConfig.VERSION_NAME

    /** Shown to the authors in the web UI's device list ([D15]). */
    val deviceName: String =
        Settings.Global.getString(context.contentResolver, Settings.Global.DEVICE_NAME) ?: "${Build.MANUFACTURER} ${Build.MODEL}"

    fun account(id: String) = accountStore.find(id)

    fun client(account: Account) = ServerClient(account.baseUrl, tokens.get(account.id), http)

    private fun anonymous(url: HttpUrl) = ServerClient(url, null, http)

    /**
     * Runs a request for [account]. A token the server no longer accepts
     * (signed out in the web UI) signs the account out here as well.
     */
    suspend fun <T> withClient(account: Account, block: suspend (ServerClient) -> T): T = try {
        block(client(account))
    } catch (error: ApiError) {
        if (error.isUnauthorized) signedOutByServer(account)
        throw error
    }

    // Connecting and signing in ([D14])

    suspend fun connect(address: String): PendingServer {
        val url = ServerAddress.normalize(address)
        return PendingServer(url.toString(), anonymous(url).info(appVersion))
    }

    suspend fun signIn(server: PendingServer, email: String, password: String) =
        add(anonymous(server.baseUrl).signIn(email, password, deviceName), server)

    /**
     * OIDC through the server: the browser runs the provider's sign-in, the
     * server hands back a one-time code via `ownsteps://auth`, and only this
     * app can redeem it (PKCE). Returns the page to open.
     */
    fun startOidc(server: PendingServer): HttpUrl {
        val pending = PendingOidc(server, Pkce.generate().verifier, Pkce.randomToken())
        prefs.pendingOidc = ApiJson.encodeToString(pending)
        oidc.value = OidcState.Running
        return anonymous(server.baseUrl).oidcStartUrl(Pkce(pending.verifier), pending.state, deviceName)
    }

    /** The browser came back with `ownsteps://auth?…`. */
    fun finishOidc(link: String) {
        val pending = prefs.pendingOidc?.let { runCatching { ApiJson.decodeFromString<PendingOidc>(it) }.getOrNull() }
        prefs.pendingOidc = null
        scope.launch {
            oidc.value = try {
                pending ?: throw OidcCallback.Problem.Mismatch
                val code = OidcCallback.code(link, pending.state)
                add(anonymous(pending.server.baseUrl).exchange(code, Pkce(pending.verifier)), pending.server)
                OidcState.Idle
            } catch (error: Exception) {
                OidcState.Failed(error)
            }
        }
    }

    /** Back from the browser without a callback: the user closed it. */
    fun cancelOidc() {
        if (oidc.value == OidcState.Running) oidc.value = OidcState.Idle
    }

    private suspend fun add(signedIn: AuthorToken, server: PendingServer) {
        // Signing in again to the same server replaces the old account but
        // keeps its ID: queued steps and the offline copy are filed under it.
        // The same goes for an account the server signed out with steps waiting.
        val previous = accounts.value.filter { it.isAuthor && it.serverUrl == server.url }
        for (old in previous) {
            // Best effort – otherwise the old device token stays valid.
            runCatching { client(old).signOut() }
            tokens.remove(old.id)
        }
        val parked = prefs.parkedAccount(server.url)
        prefs.setParkedAccount(server.url, null)
        val account = Account(
            id = previous.firstOrNull()?.id ?: parked ?: java.util.UUID.randomUUID().toString(),
            serverUrl = server.url,
            serverName = server.info.name,
            kind = Account.Kind.AUTHOR,
            displayName = signedIn.user.name,
            email = signedIn.user.email,
            timeZone = server.info.timeZone,
        )
        tokens.set(account.id, signedIn.token)
        accountStore.update { list -> list.filterNot { it.isAuthor && it.serverUrl == server.url } + account }
        startWatching()
    }

    // Following a trip ([D17])

    /** Redeems an invitation: the share link plus a name. The device then reads that one trip. */
    suspend fun follow(invite: Invite, name: String, password: String?): Account {
        val server = connect(invite.serverUrl.toString())
        val redeemed = anonymous(server.baseUrl).redeem(invite.shareLink, password?.ifEmpty { null }, name, deviceName)
        // Following the same trip again replaces the old device.
        accounts.value.filter { !it.isAuthor && it.serverUrl == server.url && it.tripId == redeemed.trip.id }.forEach { unfollow(it) }
        val account = Account(
            serverUrl = server.url,
            serverName = server.info.name,
            kind = Account.Kind.VIEWER,
            displayName = redeemed.viewer.name,
            tripId = redeemed.trip.id,
            timeZone = server.info.timeZone,
        )
        tokens.set(account.id, redeemed.token)
        cache.saveTrips(account.id, listOf(redeemed.trip))
        accountStore.update { it + account }
        prefs.readerName = redeemed.viewer.name
        startWatching()
        return account
    }

    /** The server forgets the device (best effort), the app forgets the trip. */
    suspend fun unfollow(account: Account) {
        runCatching { client(account).unfollow() }
        forget(account)
    }

    /** Signs out on the server (best effort – offline it just forgets the token). */
    suspend fun signOut(account: Account) {
        runCatching { if (account.isAuthor) client(account).signOut() else client(account).unfollow() }
        forget(account)
    }

    /**
     * For tokens the server no longer accepts. What was written on the road
     * and not sent yet stays: signing in to that server again takes it over.
     */
    fun signedOutByServer(account: Account) = scope.launch {
        if (account.isAuthor && uploads.hasPending(account.id)) {
            prefs.setParkedAccount(account.serverUrl, account.id)
            notice.value = context.getString(R.string.signed_out_by_server_pending, account.host)
            forget(account, keepingQueue = true)
        } else {
            notice.value = context.getString(R.string.signed_out_by_server, account.host)
            forget(account)
        }
    }

    private suspend fun forget(account: Account, keepingQueue: Boolean = false) {
        if (this.account(account.id) == null) return
        tokens.remove(account.id)
        accountStore.update { list -> list.filterNot { it.id == account.id } }
        prefs.removeAll(account.id)
        cache.removeAll(account.id)
        photos.removeAll(account.id)
        if (!keepingQueue) uploads.removeAll(account.id)
    }

    /**
     * Library photos from the trip's period that aren't in it yet ([D22]),
     * newest first. Empty without library access – only the menu asks for it.
     */
    suspend fun photoSuggestions(account: Account, trip: TripDetail): List<LibraryItem> {
        if (!Library.hasAccess(context)) return emptyList()
        val window = PhotoSuggestions.window(
            trip.trip.startDate, trip.trip.endDate, trip.steps.firstOrNull()?.occurredAt, trip.steps.lastOrNull()?.occurredAt,
            account.calendar, java.time.Instant.now(),
        ) ?: return emptyList()
        val items = Library.items(context, window)
        val kept = PhotoSuggestions.filter(items.map { it.candidate }, uploads.knownAssets(account.id), trip.steps.flatMap { it.photos })
            .map { it.id }.toSet()
        return items.filter { it.assetId in kept }
    }

    // Uploads and news

    /** On launch, when the app comes back and after adding something: send what's due. */
    fun resumeUploads() = UploadWorker.schedule(context)

    private val newsMutex = Mutex()

    private fun startWatching() = scope.launch {
        checkForNews(notify = false)
    }

    /**
     * Follows each server's change feed ([D16]). Trips that changed are
     * fetched again, which keeps the offline copy fresh; comparing with the
     * old copy tells what's new. Only background runs notify – in the
     * foreground the user sees it anyway. Runs one at a time, or two runs
     * would read the same cursor and notify twice.
     */
    suspend fun checkForNews(notify: Boolean) = newsMutex.withLock {
        for (account in accounts.value) {
            try {
                val client = client(account)
                val start = prefs.cursor(account.id)
                if (start == null) {
                    prefs.setCursor(account.id, client.changes(null).cursor)
                    continue
                }
                var cursor: Long = start
                val tripIds = mutableSetOf<Long>()
                do {
                    val feed = client.changes(cursor)
                    tripIds += feed.changes.map { it.tripId }
                    cursor = feed.cursor
                } while (feed.hasMore && feed.changes.isNotEmpty())
                // Otherwise the same changes come again; trips fetched already then compare equal.
                if (tripIds.all { refreshTrip(it, account, client, notify) }) prefs.setCursor(account.id, cursor)
            } catch (_: Exception) {
                // Offline, signed out or sharing off: the next run tries again.
            }
        }
    }

    /** False if the trip couldn't be fetched and the change must be seen again. */
    private suspend fun refreshTrip(tripId: Long, account: Account, client: ServerClient, notify: Boolean): Boolean {
        val old = cache.trip(account.id, tripId)?.value
        return try {
            val fresh = client.trip(tripId)
            cache.saveTrip(account.id, fresh)
            if (notify && !prefs.isMuted(account.id, tripId)) {
                Notifications.post(context, account, TripNews.items(old, fresh, reader = !account.isAuthor, ownName = account.displayName))
            }
            true
        } catch (error: ApiError) {
            // Deleted: nothing more will come of it.
            if (error.code == "trip_not_found") cache.removeTrip(account.id, tripId)
            error.code == "trip_not_found"
        } catch (_: Exception) {
            false
        }
    }
}

@Serializable
private data class PendingOidc(val server: PendingServer, val verifier: String, val state: String)
