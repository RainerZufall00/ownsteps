package de.ownsteps.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.CloudUpload
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.WifiOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import de.ownsteps.app.AppModel
import de.ownsteps.app.R
import de.ownsteps.app.TripRoute
import de.ownsteps.app.model
import de.ownsteps.app.data.UploadStatus
import de.ownsteps.app.data.UploadStatus.Phase

/**
 * A small pill at the top while steps and media are on their way: sending,
 * uploading "3/5", processing on the server, no connection, failed – and
 * briefly "Uploaded" at the end. A tap opens the trip it concerns, where the
 * cards offer retry and remove. Like the iOS app's upload indicator.
 */
@Composable
fun UploadStatusPill(modifier: Modifier = Modifier) {
    val model = LocalContext.current.model
    val current by model.uploadStatus.collectAsState()
    // Keeps the last state on screen while the pill slides away.
    var last by remember { mutableStateOf<UploadStatus?>(null) }
    SideEffect { if (current != null) last = current }
    val shown = current ?: last

    AnimatedVisibility(
        visible = current != null,
        modifier = modifier,
        enter = slideInVertically { -it } + fadeIn(),
        exit = slideOutVertically { -it } + fadeOut(),
    ) {
        val status = shown ?: return@AnimatedVisibility
        val openLabel = stringResource(R.string.upload_status_open)
        Surface(
            shape = CircleShape,
            color = MaterialTheme.colorScheme.surfaceContainerHigh,
            shadowElevation = 3.dp,
            // It sits on the top app bar: the title's room at most, never over the actions.
            modifier = Modifier.widthIn(max = 200.dp),
        ) {
            Row(
                Modifier
                    .clickable(onClickLabel = openLabel) { open(model, status) }
                    .padding(horizontal = 14.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                StatusIcon(status)
                Text(
                    title(status),
                    style = MaterialTheme.typography.labelLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

private fun open(model: AppModel, status: UploadStatus) {
    val accountId = status.accountId ?: return
    val tripId = status.tripId ?: return
    model.openTrip.value = TripRoute(accountId, tripId)
}

@Composable
private fun title(status: UploadStatus) = when (status.phase) {
    Phase.SENDING_STEP -> stringResource(R.string.upload_status_sending)
    // Counts what's finished; the ring shows the rest.
    Phase.UPLOADING -> stringResource(R.string.upload_status_uploading, status.done, status.total)
    Phase.PROCESSING -> stringResource(R.string.upload_status_processing)
    Phase.WAITING_FOR_CONNECTION -> stringResource(R.string.upload_status_offline)
    Phase.FAILED -> stringResource(R.string.upload_status_failed, status.failed)
    Phase.FINISHED -> stringResource(R.string.upload_status_done)
}

@Composable
private fun StatusIcon(status: UploadStatus) {
    val size = Modifier.size(18.dp)
    when (status.phase) {
        Phase.UPLOADING -> CircularProgressIndicator(progress = { status.fraction.coerceAtLeast(0.02f) }, modifier = size, strokeWidth = 2.dp)
        Phase.PROCESSING -> CircularProgressIndicator(modifier = size, strokeWidth = 2.dp)
        Phase.SENDING_STEP -> Icon(Icons.Outlined.CloudUpload, contentDescription = null, modifier = size)
        Phase.WAITING_FOR_CONNECTION -> Icon(Icons.Outlined.WifiOff, contentDescription = null, modifier = size, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Phase.FAILED -> Icon(Icons.Outlined.ErrorOutline, contentDescription = null, modifier = size, tint = MaterialTheme.colorScheme.error)
        Phase.FINISHED -> Icon(Icons.Filled.CheckCircle, contentDescription = null, modifier = size, tint = MaterialTheme.colorScheme.primary)
    }
}
