package de.ownsteps.app.ui.trip

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.outlined.PersonRemove
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import de.ownsteps.app.R
import de.ownsteps.app.api.ImmichConnection
import de.ownsteps.app.api.ImmichStatus
import de.ownsteps.app.api.Share
import de.ownsteps.app.api.TripFields
import de.ownsteps.app.api.Viewer
import de.ownsteps.app.data.Account
import de.ownsteps.app.model
import de.ownsteps.app.ui.ConfirmDialog
import de.ownsteps.app.ui.Dates
import de.ownsteps.app.ui.FormScreen
import de.ownsteps.app.ui.Hint
import de.ownsteps.app.ui.QrCode
import de.ownsteps.app.ui.SectionTitle
import de.ownsteps.app.ui.link
import de.ownsteps.app.ui.rememberAction
import de.ownsteps.app.ui.shareFile
import de.ownsteps.app.ui.shareLink
import kotlinx.coroutines.delay
import java.io.File

@Composable
private fun plain() = ListItemDefaults.colors(containerColor = Color.Transparent)

/**
 * Who follows the trip in the app, and the invitation for more ([D17],
 * [D21]): the share link as QR code and through the share sheet. Removing a
 * reader ends that device's access; the link itself stays valid.
 */
@Composable
fun ReadersScreen(account: Account, tripId: Long, onClose: () -> Unit) {
    val context = LocalContext.current
    val model = context.model
    var title by remember { mutableStateOf("") }
    var share by remember { mutableStateOf<Share?>(null) }
    var readers by remember { mutableStateOf<List<Viewer>?>(null) }
    var removeAll by remember { mutableStateOf(false) }
    val action = rememberAction()
    val inviteMessage = stringResource(R.string.invite_message, title)

    LaunchedEffect(Unit) {
        model.cache.trip(account.id, tripId)?.value?.trip?.let { title = it.title; share = it.share }
        action.run { readers = model.withClient(account) { it.viewers(tripId) } }
    }

    FormScreen(stringResource(R.string.readers), onClose, back = true, busy = action.busy, error = action.error) {
        SectionTitle(stringResource(R.string.invite))
        val link = share.link()
        if (link != null) {
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                QrCode(link, Modifier.size(132.dp))
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Hint(stringResource(R.string.invite_hint))
                    Button(onClick = { context.shareLink(link, title, inviteMessage) }) {
                        Icon(Icons.Filled.Share, null)
                        Text(stringResource(R.string.send_invitation))
                    }
                }
            }
            if (share?.hasPassword == true) Hint(stringResource(R.string.invite_password_hint))
        } else {
            Hint(stringResource(R.string.sharing_off_readers))
            OutlinedButton(onClick = {
                action.run { share = model.withClient(account) { it.updateTrip(tripId, TripFields(shareEnabled = true)) }.share }
            }) { Text(stringResource(R.string.turn_on_sharing)) }
        }

        SectionTitle(stringResource(R.string.readers_in_app))
        readers?.let { list ->
            if (list.isEmpty()) Hint(stringResource(R.string.no_readers))
            for (reader in list) {
                ListItem(
                    headlineContent = { Text(reader.name) },
                    supportingContent = { Text(details(reader, account)) },
                    trailingContent = {
                        IconButton(onClick = {
                            action.run {
                                model.withClient(account) { it.removeViewer(reader.id) }
                                readers = readers?.filterNot { it.id == reader.id }
                            }
                        }) { Icon(Icons.Outlined.PersonRemove, stringResource(R.string.remove)) }
                    },
                    colors = plain(),
                )
            }
            if (list.isNotEmpty()) TextButton(onClick = { removeAll = true }) { Text(stringResource(R.string.remove_all)) }
        }
        Hint(stringResource(R.string.readers_hint))
    }

    if (removeAll) {
        ConfirmDialog(
            stringResource(R.string.remove_all_readers_title), stringResource(R.string.remove_all_readers_text), stringResource(R.string.remove_all),
            onConfirm = { action.run { model.withClient(account) { it.removeAllViewers(tripId) }; readers = emptyList() } },
            onDismiss = { removeAll = false },
        )
    }
}

@Composable
private fun details(reader: Viewer, account: Account): String = listOfNotNull(
    reader.deviceName,
    reader.lastSeenAt?.let { stringResource(R.string.reader_seen, Dates.relative(it)) }
        ?: stringResource(R.string.reader_since, Dates.medium(reader.createdAt, account.calendar)),
).joinToString(" · ")

/**
 * A trip's own settings, for what's needed rarely – at the end of a trip,
 * mostly: keeping it as an offline album or sending it to Immich. Both run
 * on the server, which has the original files.
 */
@Composable
fun TripSettingsScreen(account: Account, tripId: Long, onClose: () -> Unit, onImmich: () -> Unit) {
    val context = LocalContext.current
    val model = context.model
    var connection by remember { mutableStateOf<ImmichConnection?>(null) }
    var status by remember { mutableStateOf<ImmichStatus?>(null) }
    val album = rememberAction()
    val immich = rememberAction()

    // Back from connecting Immich: look again.
    androidx.lifecycle.compose.LifecycleEventEffect(androidx.lifecycle.Lifecycle.Event.ON_RESUME) {
        immich.run {
            model.withClient(account) { client ->
                connection = client.immichConnection()
                status = client.immichStatus(tripId)
            }
        }
    }
    // Follows a running export – also one started in the web.
    LaunchedEffect(status?.state) {
        while (status?.state == ImmichStatus.State.RUNNING) {
            delay(1_000)
            runCatching { model.client(account).immichStatus(tripId) }.onSuccess { status = it }
        }
    }

    FormScreen(stringResource(R.string.trip_settings), onClose, back = true) {
        SectionTitle(stringResource(R.string.offline_album))
        OutlinedButton(onClick = {
            album.run {
                val directory = File(context.cacheDir, "albums").apply { deleteRecursively() }
                context.shareFile(model.withClient(account) { it.downloadAlbum(tripId, directory) }, "application/zip")
            }
        }, enabled = !album.busy) {
            Icon(Icons.Filled.Download, null)
            Text(stringResource(R.string.export_album))
        }
        if (album.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        Hint(album.error ?: stringResource(R.string.offline_album_hint))

        SectionTitle(stringResource(R.string.immich))
        val current = connection
        val progress = status
        when {
            current == null || progress == null -> if (immich.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            !current.connected -> OutlinedButton(onClick = onImmich) {
                Icon(Icons.Filled.Link, null)
                Text(stringResource(R.string.connect_immich))
            }
            progress.state == ImmichStatus.State.RUNNING -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                LinearProgressIndicator({ progress.done.toFloat() / maxOf(progress.total, 1) }, Modifier.fillMaxWidth())
                Hint(if (progress.total > 0) stringResource(R.string.immich_sending, progress.done, progress.total) else stringResource(R.string.starting))
            }
            else -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { immich.run { status = model.withClient(account) { it.startImmichExport(tripId) } } }) {
                    Icon(Icons.Filled.PhotoLibrary, null)
                    Text(stringResource(if (progress.state == ImmichStatus.State.DONE) R.string.send_again else R.string.send_to_immich))
                }
                if (progress.state == ImmichStatus.State.DONE) {
                    progress.albumUrl?.let { url ->
                        TextButton(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, url.toUri())) }) {
                            Icon(Icons.AutoMirrored.Filled.OpenInNew, null)
                            Text(stringResource(R.string.open_immich_album))
                        }
                    }
                    Hint(pluralStringResource(R.plurals.immich_done, progress.total, progress.total))
                }
                if (current.name != null && current.url != null) {
                    Hint(stringResource(R.string.connected_as) + ": " + current.name + " · " + (current.url.toUri().host ?: current.url))
                }
            }
        }
        Hint(immich.error ?: status?.error ?: stringResource(R.string.immich_hint))
    }
}
