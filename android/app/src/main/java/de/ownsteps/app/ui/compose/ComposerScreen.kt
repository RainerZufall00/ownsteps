package de.ownsteps.app.ui.compose

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil3.compose.AsyncImage
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import de.ownsteps.app.R
import de.ownsteps.app.api.Trip
import de.ownsteps.app.data.Account
import de.ownsteps.app.media.MediaPreparation
import de.ownsteps.app.media.Places
import de.ownsteps.app.model
import de.ownsteps.app.ui.DateField
import de.ownsteps.app.ui.FormScreen
import de.ownsteps.app.ui.Hint
import de.ownsteps.app.ui.SectionTitle

/** A new step for a trip, or more photos for one of its steps ([stepId]). */
@Composable
fun ComposerScreen(account: Account, tripId: Long, stepId: Long?, preselected: List<Long>, onClose: () -> Unit) {
    val application = LocalContext.current.applicationContext as Application
    val vm = viewModel { ComposerViewModel(application, TripTarget(account.id, tripId), stepId, preselected, emptyList()) }
    Composer(vm, onClose)
}

/**
 * Photos and videos shared from another app ([D21]): the same composer, with
 * the trip to choose – from what the app last loaded, so it works offline.
 */
@Composable
fun ShareScreen(sources: List<MediaPreparation.Source>, onDone: () -> Unit) {
    val context = LocalContext.current
    val model = context.model
    val accounts by model.accounts.collectAsState()
    val authors = accounts.filter { it.isAuthor }
    var trips by remember { mutableStateOf<List<Pair<Account, Trip>>?>(null) }
    LaunchedEffect(Unit) { trips = authors.flatMap { account -> model.cache.trips(account.id)?.value.orEmpty().map { account to it } } }
    val choices = trips ?: return
    if (choices.isEmpty()) {
        FormScreen(stringResource(R.string.new_step), onDone) {
            Text(stringResource(if (authors.isEmpty()) R.string.share_not_signed_in else R.string.share_no_trips))
        }
        return
    }
    val vm = viewModel {
        // The trip used last time, else the most recent one.
        val last = model.prefs.lastShareTrip
        val (account, trip) = choices.firstOrNull { (account, trip) -> "${account.id}/${trip.id}" == last } ?: choices.first()
        ComposerViewModel(context.applicationContext as Application, TripTarget(account.id, trip.id), null, emptyList(), sources)
    }
    Composer(vm, onDone, choices)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Composer(vm: ComposerViewModel, onClose: () -> Unit, choices: List<Pair<Account, Trip>> = emptyList()) {
    val model = LocalContext.current.model
    var picking by remember { mutableStateOf(false) }
    var choosingOnMap by remember { mutableStateOf(false) }

    FormScreen(
        title = stringResource(if (vm.isNew) R.string.new_step else R.string.add_photos),
        onClose = onClose,
        confirm = stringResource(R.string.save),
        confirmEnabled = vm.canSave,
        error = vm.error,
        onConfirm = { vm.save(onClose) },
    ) {
        if (choices.size > 1) TripChoice(vm, choices)

        OutlinedButton(onClick = { picking = true }) {
            Icon(Icons.Filled.AddPhotoAlternate, null, Modifier.padding(end = 8.dp))
            Text(stringResource(if (vm.items.isEmpty()) R.string.add_photos_or_videos else R.string.add_more))
        }
        for (item in vm.items) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(56.dp).clip(RoundedCornerShape(8.dp)).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
                    val prepared = item.prepared
                    if (prepared == null) CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp)
                    else AsyncImage(prepared.thumbnail, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                    if (prepared?.isVideo == true) Icon(Icons.Filled.PlayCircle, null, tint = Color.White)
                }
                OutlinedTextField(
                    vm.captions[item.key].orEmpty(), { vm.captions[item.key] = it }, Modifier.weight(1f),
                    placeholder = { Text(stringResource(R.string.caption_optional)) }, maxLines = 4,
                )
                IconButton(onClick = { vm.remove(item.key) }) { Icon(Icons.Outlined.Close, stringResource(R.string.remove)) }
            }
        }
        if (vm.isPreparing) Hint(stringResource(R.string.preparing_photos))
        if (model.prefs.originalVideos) Hint(stringResource(R.string.original_videos_note))

        if (vm.isNew) {
            OutlinedTextField(
                vm.body, { vm.body = it }, Modifier.fillMaxWidth(),
                label = { Text(stringResource(R.string.what_happened)) }, placeholder = { Text(stringResource(R.string.tell_about_day)) },
                minLines = 4, maxLines = 12,
            )
            DateField(stringResource(R.string.date), vm.day, vm::setDay)
            Hint(stringResource(R.string.date_from_photos))
            PlaceSection(vm, onMap = { choosingOnMap = true })
        }
    }

    if (picking) MediaPickerDialog(onDismiss = { picking = false }, onPicked = vm::add)
    if (choosingOnMap) LocationPickerDialog(vm.position, onDismiss = { choosingOnMap = false }, onPick = vm::pickedOnMap)
}

/**
 * Where the step goes on the map: where a photo was taken (preselected when
 * one knows), where the phone is now, or a place picked by hand.
 */
@Composable
private fun PlaceSection(vm: ComposerViewModel, onMap: () -> Unit) {
    val context = LocalContext.current
    val askLocation = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        vm.choose(LocationSource.CURRENT)
    }
    val sources = buildList {
        if (vm.photoPlaces.isNotEmpty()) add(LocationSource.PHOTO to R.string.from_photo)
        add(LocationSource.CURRENT to R.string.my_location)
        add(LocationSource.MAP to R.string.on_the_map)
    }
    SectionTitle(stringResource(R.string.place))
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
        sources.forEachIndexed { index, (source, label) ->
            SegmentedButton(
                selected = vm.locationSource == source,
                onClick = {
                    when {
                        source == LocationSource.MAP -> onMap()
                        source == LocationSource.CURRENT && !Places.hasPermission(context) -> askLocation.launch(Places.permissions)
                        else -> vm.choose(source)
                    }
                },
                shape = SegmentedButtonDefaults.itemShape(index, sources.size),
            ) { Text(stringResource(label), maxLines = 1) }
        }
    }
    // Photos from several places: the step can only be at one.
    if (vm.locationSource == LocationSource.PHOTO && vm.photoPlaces.size > 1) {
        for (place in vm.photoPlaces) {
            LaunchedEffect(place.key) { vm.lookUpName(place) }
            ListItem(
                headlineContent = { Text(vm.placeNames[place.key] ?: coordinates(place.lat, place.lon)) },
                leadingContent = {
                    AsyncImage(vm.thumbnail(place.key), null, Modifier.size(44.dp).clip(RoundedCornerShape(6.dp)), contentScale = ContentScale.Crop)
                },
                trailingContent = { if (place.key == vm.photoPlaceKey) Icon(Icons.Filled.Check, null, tint = MaterialTheme.colorScheme.primary) },
                colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                modifier = Modifier.clickable { vm.usePhotoPlace(place) },
            )
        }
        Hint(stringResource(R.string.photo_places_hint))
    }
    if (vm.locating) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
        Hint(stringResource(R.string.finding_location))
    }
    OutlinedTextField(vm.placeName, vm::typePlace, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.place_optional)) }, singleLine = true)
    vm.position?.let { (lat, lon) ->
        Row(verticalAlignment = Alignment.CenterVertically) {
            Hint(coordinates(lat, lon), Modifier.weight(1f))
            TextButton(onClick = vm::clearLocation) { Text(stringResource(R.string.remove)) }
        }
    }
}

private fun coordinates(lat: Double, lon: Double) = "%.5f, %.5f".format(lat, lon)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TripChoice(vm: ComposerViewModel, choices: List<Pair<Account, Trip>>) {
    var open by remember { mutableStateOf(false) }
    val several = choices.map { it.first.id }.distinct().size > 1
    fun label(choice: Pair<Account, Trip>) = if (several) "${choice.second.title} · ${choice.first.host}" else choice.second.title
    val current = choices.firstOrNull { (account, trip) -> vm.target == TripTarget(account.id, trip.id) }
    ExposedDropdownMenuBox(open, { open = it }) {
        OutlinedTextField(
            current?.let(::label).orEmpty(), {}, Modifier.fillMaxWidth().menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable),
            readOnly = true, label = { Text(stringResource(R.string.trip)) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(open) },
        )
        ExposedDropdownMenu(open, { open = false }) {
            for (choice in choices) {
                DropdownMenuItem({ Text(label(choice)) }, { vm.target = TripTarget(choice.first.id, choice.second.id); open = false })
            }
        }
    }
}
