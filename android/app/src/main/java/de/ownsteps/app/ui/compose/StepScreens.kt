package de.ownsteps.app.ui.compose

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.RestoreFromTrash
import androidx.compose.material3.BottomAppBar
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import de.ownsteps.app.R
import de.ownsteps.app.api.Step
import de.ownsteps.app.api.StepPatch
import de.ownsteps.app.api.TripDetail
import de.ownsteps.app.api.Variant
import de.ownsteps.app.data.Account
import de.ownsteps.app.media.Library
import de.ownsteps.app.media.LibraryItem
import de.ownsteps.app.model
import de.ownsteps.app.ui.ConfirmDialog
import de.ownsteps.app.ui.DateField
import de.ownsteps.app.ui.FormScreen
import de.ownsteps.app.ui.Hint
import de.ownsteps.app.ui.RemoteImage
import de.ownsteps.app.ui.ScreenScaffold
import de.ownsteps.app.ui.SectionTitle
import de.ownsteps.app.ui.rememberAction
import kotlinx.coroutines.launch
import java.time.LocalDate

/** Changing a step the server has. Needs a connection – offline, only new steps can be written ([D19]). */
@Composable
fun EditStepScreen(account: Account, tripId: Long, stepId: Long, onClose: () -> Unit) {
    val model = LocalContext.current.model
    var step by remember { mutableStateOf<Step?>(null) }
    var body by remember { mutableStateOf("") }
    var place by remember { mutableStateOf("") }
    var day by remember { mutableStateOf(LocalDate.now()) }
    val captions = remember { mutableStateMapOf<Long, String>() }
    val removed = remember { mutableStateListOf<Long>() }
    var confirmDelete by remember { mutableStateOf(false) }
    val action = rememberAction()
    val calendar = account.calendar

    LaunchedEffect(Unit) {
        model.cache.trip(account.id, tripId)?.value?.steps?.firstOrNull { it.id == stepId }?.let {
            step = it
            body = it.body
            place = it.placeName.orEmpty()
            day = calendar.localDate(it.occurredAt)
            it.photos.forEach { photo -> captions[photo.id] = photo.caption.orEmpty() }
        }
    }
    val current = step

    FormScreen(
        title = stringResource(R.string.edit_step),
        onClose = onClose,
        confirm = stringResource(R.string.save),
        confirmEnabled = current != null,
        busy = action.busy,
        error = action.error,
        onConfirm = {
            action.run(onSuccess = onClose) {
                model.withClient(account) { client ->
                    client.updateStep(stepId, StepPatch(
                        body = body,
                        // An empty string clears the place.
                        placeName = place.trim(),
                        // The server keeps the time of day from the photos and only swaps the date.
                        occurredDate = day.toString().takeIf { day != calendar.localDate(current!!.occurredAt) },
                    ))
                    for (photo in current!!.photos) {
                        val caption = captions[photo.id].orEmpty().trim()
                        when {
                            photo.id in removed -> client.deletePhoto(photo.id)
                            caption != photo.caption.orEmpty() -> client.updateCaption(photo.id, caption)
                        }
                    }
                }
            }
        },
    ) {
        if (current == null) return@FormScreen
        OutlinedTextField(body, { body = it }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.what_happened)) }, minLines = 4, maxLines = 12)
        DateField(stringResource(R.string.date), day, { day = it })
        OutlinedTextField(place, { place = it }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.place_optional)) }, singleLine = true)
        if (current.photos.isNotEmpty()) SectionTitle(stringResource(R.string.photos))
        for (photo in current.photos) {
            val gone = photo.id in removed
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.alpha(if (gone) 0.4f else 1f)) {
                RemoteImage(account, photo, Variant.THUMB, Modifier.size(56.dp).clip(RoundedCornerShape(8.dp)))
                OutlinedTextField(
                    captions[photo.id].orEmpty(), { captions[photo.id] = it }, Modifier.weight(1f),
                    placeholder = { Text(stringResource(R.string.caption_optional)) }, enabled = !gone, maxLines = 4,
                )
                IconButton(onClick = { if (gone) removed.remove(photo.id) else removed += photo.id }) {
                    Icon(if (gone) Icons.Outlined.RestoreFromTrash else Icons.Outlined.Delete, stringResource(R.string.remove))
                }
            }
        }
        OutlinedButton(onClick = { confirmDelete = true }) { Text(stringResource(R.string.delete_step), color = MaterialTheme.colorScheme.error) }
    }

    if (confirmDelete) {
        ConfirmDialog(
            stringResource(R.string.delete_step_title), null, stringResource(R.string.delete_step),
            onConfirm = { action.run(onSuccess = onClose) { model.withClient(account) { it.deleteStep(stepId) } } },
            onDismiss = { confirmDelete = false },
        )
    }
}

/**
 * Library photos from the trip's period that aren't in it yet ([D22]), by
 * day. The chosen ones become a new step, or are hidden for good.
 */
@Composable
fun SuggestionsScreen(account: Account, tripId: Long, onClose: () -> Unit, onCompose: (List<Long>) -> Unit) {
    val context = LocalContext.current
    val model = context.model
    val access = rememberLibraryAccess()
    var items by remember { mutableStateOf<List<LibraryItem>?>(null) }
    val selected = remember { mutableStateListOf<Long>() }
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    suspend fun load() {
        val trip: TripDetail = model.cache.trip(account.id, tripId)?.value ?: return
        items = model.photoSuggestions(account, trip).sortedBy { it.takenAt }
    }
    LaunchedEffect(access.granted, access.version) { if (access.granted) load() }

    ScreenScaffold(
        title = stringResource(R.string.photo_suggestions),
        onClose = onClose,
        back = true,
        actions = {
            val all = selected.isNotEmpty() && selected.size == items?.size
            if (!items.isNullOrEmpty()) TextButton(onClick = { selected.clear(); if (!all) selected += items.orEmpty().map { it.id } }) {
                Text(stringResource(if (all) R.string.deselect else R.string.select_all))
            }
        },
        bottomBar = {
            if (selected.isNotEmpty()) BottomAppBar {
                TextButton(onClick = {
                    val hidden = selected.map(Long::toString)
                    selected.clear()
                    scope.launch { model.uploads.ignore(account.id, hidden); load() }
                }) { Text(stringResource(R.string.hide)) }
                Box(Modifier.weight(1f))
                Button(onClick = { onCompose(selected.toList()) }, Modifier.padding(end = 8.dp)) {
                    Text(pluralStringResource(R.plurals.new_step_with, selected.size, selected.size))
                }
            }
        },
    ) { padding ->
        val modifier = Modifier.padding(padding)
        val list = items
        when {
            !access.granted -> Column(modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text(stringResource(R.string.no_photo_access_text))
                Button(onClick = access.request) { Text(stringResource(R.string.allow_access)) }
            }
            list == null -> Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            list.isEmpty() -> Box(modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) { Hint(stringResource(R.string.no_suggestions)) }
            else -> LibraryGrid(list, selected, { if (!selected.remove(it.id)) selected += it.id }, modifier, days = account.calendar) {
                if (Library.isPartial(context)) Hint(stringResource(R.string.limited_library), Modifier.padding(16.dp))
            }
        }
    }
}
