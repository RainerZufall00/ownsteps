package de.ownsteps.app.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.core.content.edit
import de.ownsteps.app.api.ApiJson
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import java.security.KeyStore
import java.time.ZoneId
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** A signed-in server, as the app remembers it. The token isn't part of it – see [TokenStore]. */
@Serializable
data class Account(
    val id: String = UUID.randomUUID().toString(),
    /** The server's base URL, ending in "/". */
    val serverUrl: String,
    val serverName: String,
    val kind: Kind,
    val displayName: String,
    val email: String? = null,
    /** Readers only: the trip they follow. */
    val tripId: Long? = null,
    /** The server's time zone – dates and trip days are shown in it, like on the web ([E12]). */
    val timeZone: String? = null,
) {
    @Serializable
    enum class Kind {
        /** Device token: reads and writes everything on that server. */
        @SerialName("author") AUTHOR,
        /** Viewer token: reads one trip ([D17]). */
        @SerialName("viewer") VIEWER,
    }

    val isAuthor get() = kind == Kind.AUTHOR
    val baseUrl: HttpUrl get() = serverUrl.toHttpUrl()
    val host: String get() = baseUrl.host
    val zone: ZoneId get() = timeZone?.let { runCatching { ZoneId.of(it) }.getOrNull() } ?: ZoneId.systemDefault()
    val calendar get() = TripCalendar(zone)
}

/** The list of accounts in shared preferences (no secrets in there). */
class AccountStore(context: Context) {
    private val prefs = context.getSharedPreferences("accounts", Context.MODE_PRIVATE)
    private val state = MutableStateFlow(load())

    val accounts: StateFlow<List<Account>> = state.asStateFlow()

    fun find(id: String) = state.value.firstOrNull { it.id == id }

    fun update(change: (List<Account>) -> List<Account>) {
        val next = change(state.value)
        prefs.edit { putString(KEY, ApiJson.encodeToString(next)) }
        state.value = next
    }

    private fun load(): List<Account> =
        prefs.getString(KEY, null)?.let { runCatching { ApiJson.decodeFromString<List<Account>>(it) }.getOrNull() }
            ?: emptyList()

    private companion object {
        const val KEY = "accounts.v1"
    }
}

/**
 * Tokens, encrypted with a key in the Android Keystore. The key needs no
 * unlocked screen, so background refresh and uploads work in the pocket;
 * it never leaves the device, so backups carry nothing usable.
 */
class TokenStore(context: Context) {
    private val prefs = context.getSharedPreferences("tokens", Context.MODE_PRIVATE)

    fun get(accountId: String): String? {
        val stored = prefs.getString(accountId, null) ?: return null
        return runCatching {
            val (iv, data) = stored.split(":").map { Base64.decode(it, Base64.NO_WRAP) }
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
            String(cipher.doFinal(data))
        }.getOrNull()
    }

    fun set(accountId: String, token: String) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encoded = listOf(cipher.iv, cipher.doFinal(token.toByteArray()))
            .joinToString(":") { Base64.encodeToString(it, Base64.NO_WRAP) }
        prefs.edit { putString(accountId, encoded) }
    }

    fun remove(accountId: String) = prefs.edit { remove(accountId) }

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (keyStore.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE).apply {
            init(
                KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build(),
            )
        }.generateKey()
    }

    private companion object {
        const val KEYSTORE = "AndroidKeyStore"
        const val ALIAS = "ownsteps.tokens"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}

/** Small settings and bookkeeping that don't belong in the database. */
class Prefs(context: Context) {
    private val prefs = context.getSharedPreferences("ownsteps", Context.MODE_PRIVATE)

    /** Off: videos are reduced to 1080p before uploading ([D20]). */
    var originalVideos: Boolean
        get() = prefs.getBoolean("uploads.originalVideos", false)
        set(value) = prefs.edit { putBoolean("uploads.originalVideos", value) }

    /** The name readers used last time, so a second invitation is quicker. */
    var readerName: String
        get() = prefs.getString("reader.name", "").orEmpty()
        set(value) = prefs.edit { putString("reader.name", value) }

    /** The trip the share sheet used last. */
    var lastShareTrip: String?
        get() = prefs.getString("share.lastTrip", null)
        set(value) = prefs.edit { putString("share.lastTrip", value) }

    /** Where each account's change feed stands ([D16]). */
    fun cursor(accountId: String): Long? = prefs.getLong("changes.cursor.$accountId", -1).takeIf { it >= 0 }
    fun setCursor(accountId: String, cursor: Long?) = prefs.edit {
        if (cursor == null) remove("changes.cursor.$accountId") else putLong("changes.cursor.$accountId", cursor)
    }

    /**
     * The account an author had on a server when the server signed it out
     * with unsent steps – the next sign-in there continues under it.
     */
    fun parkedAccount(serverUrl: String): String? = prefs.getString("parked.$serverUrl", null)
    fun setParkedAccount(serverUrl: String, accountId: String?) = prefs.edit {
        if (accountId == null) remove("parked.$serverUrl") else putString("parked.$serverUrl", accountId)
    }

    fun isMuted(accountId: String, tripId: Long) = "$accountId/$tripId" in mutedTrips()
    fun setMuted(accountId: String, tripId: Long, muted: Boolean) = prefs.edit {
        val key = "$accountId/$tripId"
        putStringSet("notifications.muted", if (muted) mutedTrips() + key else mutedTrips() - key)
    }

    private fun mutedTrips(): Set<String> = prefs.getStringSet("notifications.muted", emptySet()).orEmpty()

    /** "Not now" on photo suggestions: hidden until newer photos turn up (epoch ms). */
    fun suggestionsDismissedUntil(accountId: String, tripId: Long): Long =
        prefs.getLong("suggestions.dismissed.$accountId/$tripId", 0)
    fun setSuggestionsDismissedUntil(accountId: String, tripId: Long, until: Long) =
        prefs.edit { putLong("suggestions.dismissed.$accountId/$tripId", until) }

    /** OIDC sign-in in progress – survives the app being killed while the browser is open. */
    var pendingOidc: String?
        get() = prefs.getString("oidc.pending", null)
        set(value) = prefs.edit { putString("oidc.pending", value) }

    /** Forgets everything filed under an account. */
    fun removeAll(accountId: String) = prefs.edit {
        prefs.all.keys.filter { accountId in it }.forEach(::remove)
        putStringSet("notifications.muted", mutedTrips().filterNot { it.startsWith(accountId) }.toSet())
    }
}
