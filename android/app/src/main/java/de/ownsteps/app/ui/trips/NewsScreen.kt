package de.ownsteps.app.ui.trips

import android.app.Application
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material.icons.outlined.Place
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import de.ownsteps.app.R
import de.ownsteps.app.data.NewsEntry
import de.ownsteps.app.data.TripNews
import de.ownsteps.app.model
import de.ownsteps.app.ui.Dates
import de.ownsteps.app.ui.Hint
import kotlinx.coroutines.launch
import java.time.Instant

/** The bell above the trips, with the number of unread news. */
@Composable
fun NewsBell(onClick: () -> Unit) {
    val unread by LocalContext.current.model.news.unread.collectAsState(0)
    val label = if (unread > 0) pluralStringResource(R.plurals.news_unread, unread, unread) else stringResource(R.string.news)
    IconButton(onClick) {
        BadgedBox(badge = { if (unread > 0) Badge { Text(if (unread > 99) "99+" else "$unread") } }) {
            Icon(Icons.Outlined.NotificationsNone, label)
        }
    }
}

/** Lives as long as the list is on the back stack – not just on screen. */
class NewsViewModel(application: Application) : AndroidViewModel(application) {
    private val model = application.model
    val entries = model.news.entries

    fun open(entry: NewsEntry) = model.scope.launch { model.news.markRead(entry) }

    /** Leaving the list, not a trip opened from it, marks the rest read. */
    override fun onCleared() {
        model.scope.launch { model.news.markAllRead() }
    }
}

/**
 * New comments (authors) and steps (readers) across every trip, newest
 * first. Unread ones stand out until the list is left. A tap opens the
 * trip at that step, like a notification.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewsScreen(onOpen: (NewsEntry) -> Unit, onClose: () -> Unit, viewModel: NewsViewModel = viewModel()) {
    val entries by viewModel.entries.collectAsState(null)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.news)) },
                navigationIcon = { IconButton(onClose) { Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.back)) } },
            )
        },
    ) { padding ->
        val list = entries ?: return@Scaffold
        if (list.isEmpty()) {
            Box(Modifier.padding(padding).fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
                Hint(stringResource(R.string.no_news))
            }
            return@Scaffold
        }
        LazyColumn(Modifier.padding(padding).fillMaxSize()) {
            items(list, key = { "${it.accountId}-${it.kind}-${it.itemId}" }) { entry -> NewsRow(entry) { viewModel.open(entry); onOpen(entry) } }
        }
    }
}

@Composable
private fun NewsRow(entry: NewsEntry, onClick: () -> Unit) {
    val isStep = entry.kind == TripNews.Kind.STEP
    val title = if (isStep) stringResource(R.string.news_new_step, entry.title) else entry.title
    val weight = if (entry.read) FontWeight.Normal else FontWeight.SemiBold
    ListItem(
        modifier = Modifier.clickable(onClick = onClick),
        leadingContent = {
            BadgedBox(badge = { if (!entry.read) Badge(Modifier.size(8.dp).clip(CircleShape)) }) {
                Icon(if (isStep) Icons.Outlined.Place else Icons.Outlined.ChatBubbleOutline, null)
            }
        },
        overlineContent = { Text(Dates.relative(Instant.ofEpochMilli(entry.at))) },
        headlineContent = { Text(title, fontWeight = weight, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        supportingContent = entry.body.takeIf { it.isNotEmpty() }?.let { { Text(it, maxLines = 3, overflow = TextOverflow.Ellipsis) } },
        colors = if (entry.read) ListItemDefaults.colors() else ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.35f)),
    )
}
