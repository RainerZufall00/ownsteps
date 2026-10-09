package de.ownsteps.app.ui.trips

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import de.ownsteps.app.R
import de.ownsteps.app.api.Trip
import de.ownsteps.app.api.TripFields
import de.ownsteps.app.data.Account
import de.ownsteps.app.media.MediaPreparation
import de.ownsteps.app.model
import de.ownsteps.app.ui.FormScreen
import de.ownsteps.app.ui.Hint
import de.ownsteps.app.ui.OptionalDateField
import de.ownsteps.app.ui.rememberAction
import java.time.LocalDate

/** Creating a trip, or changing its title, dates, summary and cover. */
@Composable
fun TripFormScreen(account: Account, tripId: Long?, onClose: () -> Unit, onSaved: (Trip) -> Unit) {
    val model = LocalContext.current.model
    var loaded by rememberSaveable { mutableStateOf(tripId == null) }
    var title by rememberSaveable { mutableStateOf("") }
    var summary by rememberSaveable { mutableStateOf("") }
    var start by rememberSaveable { mutableStateOf<LocalDate?>(null) }
    var end by rememberSaveable { mutableStateOf<LocalDate?>(null) }
    var cover by rememberSaveable { mutableStateOf<Uri?>(null) }
    var hasCover by rememberSaveable { mutableStateOf(false) }
    val action = rememberAction()
    val pickCover = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let { cover = it } }

    // The form starts from the offline copy; the save goes to the server.
    if (tripId != null && !loaded) LaunchedEffect(Unit) {
        model.cache.trip(account.id, tripId)?.value?.trip?.let {
            title = it.title
            summary = it.summary.orEmpty()
            start = it.startDate?.let(LocalDate::parse)
            end = it.endDate?.let(LocalDate::parse)
            hasCover = it.coverPhotoId != null
        }
        loaded = true
    }

    FormScreen(
        title = stringResource(if (tripId == null) R.string.new_trip else R.string.edit_trip),
        onClose = onClose,
        confirm = stringResource(R.string.save),
        confirmEnabled = title.isNotBlank() && loaded,
        busy = action.busy,
        error = action.error,
        onConfirm = {
            var saved: Trip? = null
            action.run(onSuccess = { model.tripListRevision.value++; onSaved(saved!!) }) {
                // Empty strings clear a field on the server; null leaves it.
                val fields = TripFields(
                    title = title.trim(),
                    summary = if (tripId == null) summary.trim().ifEmpty { null } else summary.trim(),
                    startDate = start?.toString() ?: if (tripId == null) null else "",
                    endDate = end?.toString() ?: if (tripId == null) null else "",
                )
                saved = model.withClient(account) { client ->
                    val result = if (tripId == null) client.createTrip(fields) else client.updateTrip(tripId, fields)
                    cover?.let { uri ->
                        // Directly, not through the queue: one image, and the form waits for it.
                        val prepared = model.media.prepare(MediaPreparation.Source(uri), account.zone, originalVideos = false)
                        try {
                            client.uploadCover(result.id, prepared.file)
                        } finally {
                            prepared.discard()
                        }
                    }
                    result
                }
            }
        },
    ) {
        OutlinedTextField(title, { title = it }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.trip_name)) }, singleLine = true)
        OutlinedTextField(summary, { summary = it }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.trip_summary)) }, minLines = 2, maxLines = 5)
        OptionalDateField(stringResource(R.string.start_date), start, { start = it })
        OptionalDateField(stringResource(R.string.end_date), end, { end = it }, notBefore = start)
        Hint(stringResource(R.string.trip_dates_hint))
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(onClick = { pickCover.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) {
                Icon(Icons.Outlined.Image, null)
                Text(stringResource(if (hasCover || cover != null) R.string.change_cover else R.string.choose_cover))
            }
            cover?.let { AsyncImage(it, null, Modifier.size(56.dp).clip(RoundedCornerShape(8.dp)), contentScale = ContentScale.Crop) }
        }
        Hint(stringResource(R.string.cover_hint))
    }
}
