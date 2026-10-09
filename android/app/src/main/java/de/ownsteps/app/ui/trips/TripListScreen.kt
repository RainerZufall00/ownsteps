package de.ownsteps.app.ui.trips

import android.app.Application
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.outlined.Luggage
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavController
import de.ownsteps.app.R
import de.ownsteps.app.api.ApiError
import de.ownsteps.app.api.Trip
import de.ownsteps.app.api.Variant
import de.ownsteps.app.data.Account
import de.ownsteps.app.model
import de.ownsteps.app.ui.ConfirmDialog
import de.ownsteps.app.ui.Dates
import de.ownsteps.app.ui.ErrorText
import de.ownsteps.app.ui.Hint
import de.ownsteps.app.ui.OfflineNote
import de.ownsteps.app.ui.Routes
import de.ownsteps.app.ui.TripCover
import de.ownsteps.app.ui.tripCounts
import kotlinx.coroutines.launch

/** The trips of every server, cached first and refreshed behind it. */
class TripListViewModel(application: Application) : AndroidViewModel(application) {
    private val model = application.model
    val trips = mutableStateMapOf<String, List<Trip>>()
    val errors = mutableStateMapOf<String, String>()
    val staleSince = mutableStateMapOf<String, Long>()
    var refreshing by mutableStateOf(false)
        private set

    init {
        viewModelScope.launch {
            model.accounts.value.forEach { account -> model.cache.trips(account.id)?.let { trips[account.id] = it.value } }
        }
    }

    fun refresh() = viewModelScope.launch {
        refreshing = true
        for (account in model.accounts.value) {
            try {
                val fresh = model.withClient(account) { it.trips() }
                trips[account.id] = fresh
                model.cache.saveTrips(account.id, fresh)
                errors.remove(account.id)
                staleSince.remove(account.id)
            } catch (error: Exception) {
                if (error is ApiError && error.isUnauthorized) continue
                errors[account.id] = ErrorText.message(getApplication(), error)
                // Offline with something cached: say how old it is.
                model.cache.trips(account.id)?.let { staleSince[account.id] = it.fetchedAt }
            }
        }
        refreshing = false
    }
}

/**
 * Trips as large cover cards, grouped by server, followed trips last. One
 * column on phones, more where there's room.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun TripListScreen(navController: NavController, viewModel: TripListViewModel = viewModel()) {
    val model = LocalContext.current.model
    val accounts by model.accounts.collectAsState()
    val revision by model.tripListRevision.collectAsState()
    val authors = accounts.filter { it.isAuthor }
    val readers = accounts.filterNot { it.isAuthor }
    var menu by remember { mutableStateOf(false) }
    var chooseServer by remember { mutableStateOf(false) }
    var unfollow by remember { mutableStateOf<Account?>(null) }
    val scroll = TopAppBarDefaults.exitUntilCollapsedScrollBehavior()
    val followingTitle = stringResource(R.string.following)
    val newTrip = { account: Account -> navController.navigate(Routes.TripForm(account.id)) }
    val open = { account: Account, trip: Trip -> navController.navigate(Routes.Trip(account.id, trip.id)) }

    LaunchedEffect(accounts, revision) { viewModel.refresh() }

    Scaffold(
        modifier = Modifier.nestedScroll(scroll.nestedScrollConnection),
        topBar = {
            LargeTopAppBar(
                title = { Text(stringResource(R.string.trips)) },
                scrollBehavior = scroll,
                actions = {
                    IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, stringResource(R.string.more)) }
                    DropdownMenu(menu, { menu = false }) {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.follow_trip_menu)) },
                            leadingIcon = { Icon(Icons.Filled.PersonAdd, null) },
                            onClick = { menu = false; navController.navigate(Routes.Follow()) },
                        )
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.settings)) },
                            leadingIcon = { Icon(Icons.Filled.Settings, null) },
                            onClick = { menu = false; navController.navigate(Routes.Settings) },
                        )
                    }
                },
            )
        },
        floatingActionButton = {
            if (authors.isNotEmpty()) {
                ExtendedFloatingActionButton(
                    onClick = { if (authors.size == 1) newTrip(authors.first()) else chooseServer = true },
                    icon = { Icon(Icons.Filled.Add, null) },
                    text = { Text(stringResource(R.string.new_trip)) },
                )
                DropdownMenu(chooseServer, { chooseServer = false }) {
                    authors.forEach { account ->
                        DropdownMenuItem(text = { Text(account.host) }, onClick = { chooseServer = false; newTrip(account) })
                    }
                }
            }
        },
    ) { padding ->
        PullToRefreshBox(viewModel.refreshing, viewModel::refresh, Modifier.padding(padding).fillMaxSize()) {
            LazyVerticalGrid(
                columns = GridCells.Adaptive(320.dp),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 96.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                for (account in authors) {
                    if (authors.size > 1) header(account.host)
                    accountTrips(account, viewModel, onEmpty = { newTrip(account) }) { trip -> TripCard(account, trip, onClick = { open(account, trip) }) }
                }
                if (readers.isNotEmpty()) header(followingTitle)
                items(readers, key = { it.id }) { account ->
                    val trip = viewModel.trips[account.id]?.firstOrNull()
                    if (trip != null) {
                        TripCard(account, trip, badge = account.host, onClick = { open(account, trip) }, onLongClick = { unfollow = account })
                    } else {
                        Card(Modifier.fillMaxWidth().combinedClickable(onClick = {}, onLongClick = { unfollow = account })) {
                            Column(Modifier.padding(16.dp)) {
                                Text(account.host, style = MaterialTheme.typography.titleMedium)
                                Hint(viewModel.errors[account.id] ?: stringResource(R.string.loading))
                            }
                        }
                    }
                }
            }
        }
    }

    unfollow?.let { account ->
        ConfirmDialog(
            title = stringResource(R.string.unfollow_title),
            text = stringResource(R.string.unfollow_text),
            confirm = stringResource(R.string.unfollow),
            onConfirm = { model.scope.launch { model.unfollow(account) } },
            onDismiss = { unfollow = null },
        )
    }
}

private fun LazyGridScope.header(title: String) = item(span = { GridItemSpan(maxLineSpan) }) {
    Text(title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 8.dp))
}

private fun LazyGridScope.accountTrips(
    account: Account,
    viewModel: TripListViewModel,
    onEmpty: () -> Unit,
    card: @Composable (Trip) -> Unit,
) {
    val trips = viewModel.trips[account.id]
    val error = viewModel.errors[account.id]
    when {
        trips == null && error != null -> item(span = { GridItemSpan(maxLineSpan) }) { Hint(error) }
        trips == null -> item(span = { GridItemSpan(maxLineSpan) }) {
            Box(Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        }
        trips.isEmpty() -> item(span = { GridItemSpan(maxLineSpan) }) { EmptyTrips(onEmpty) }
        else -> items(trips, key = { "${account.id}/${it.id}" }) { card(it) }
    }
    viewModel.staleSince[account.id]?.let { since -> item(span = { GridItemSpan(maxLineSpan) }) { OfflineNote(since) } }
}

@Composable
private fun EmptyTrips(onNew: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(vertical = 48.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(Icons.Outlined.Luggage, null, Modifier.height(48.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(stringResource(R.string.no_trips), style = MaterialTheme.typography.titleMedium)
        Hint(stringResource(R.string.no_trips_hint))
        AssistChip(onClick = onNew, label = { Text(stringResource(R.string.new_trip)) })
    }
}

/** A trip as a large cover card: the photo edge to edge, title and dates on a shade at the bottom. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun TripCard(account: Account, trip: Trip, onClick: () -> Unit, onLongClick: (() -> Unit)? = null, badge: String? = null) {
    val context = LocalContext.current
    Card(Modifier.fillMaxWidth().height(230.dp).combinedClickable(onClick = onClick, onLongClick = onLongClick), shape = MaterialTheme.shapes.extraLarge) {
        Box(Modifier.fillMaxSize()) {
            TripCover(account, trip, Variant.MEDIUM, Modifier.fillMaxSize())
            Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0.35f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.72f))))
            Column(Modifier.align(Alignment.BottomStart).padding(18.dp)) {
                Text(trip.title, style = MaterialTheme.typography.headlineSmall, color = Color.White, maxLines = 2, overflow = TextOverflow.Ellipsis)
                val range = Dates.tripRange(context, trip, account.calendar)
                Text(
                    listOfNotNull(range, tripCounts(trip)).joinToString(" · "),
                    style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.85f), maxLines = 1,
                )
            }
            badge?.let {
                AssistChip(
                    onClick = onClick, label = { Text(it, maxLines = 1) },
                    leadingIcon = { Icon(Icons.Filled.People, null) },
                    modifier = Modifier.padding(12.dp).align(Alignment.TopStart),
                )
            }
        }
    }
}
