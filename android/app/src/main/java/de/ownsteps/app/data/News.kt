package de.ownsteps.app.data

import de.ownsteps.app.api.Step
import de.ownsteps.app.api.TripDetail
import kotlinx.coroutines.flow.Flow

/**
 * The bell: what's new in the trips, as the device noticed it. Every fresh
 * copy of a trip – change feed, trip screen, foreground or background –
 * passes through [record], so it holds what a notification could miss:
 * background runs come when the system lets them, and a trip opened in the
 * app was fetched before the change feed could compare it ([D16]).
 */
class NewsInbox(private val dao: NewsDao) {
    val entries: Flow<List<NewsEntry>> = dao.observe(KEEP)
    val unread: Flow<Int> = dao.observeUnread()

    suspend fun record(accountId: String, trip: TripDetail, items: List<TripNews.Item>) {
        if (items.isNotEmpty()) {
            dao.insert(items.map { NewsEntry(accountId, it.kind, it.id, it.tripId, it.stepId, it.title, it.body, it.at.toEpochMilli()) })
            dao.trim(KEEP)
        }
        // Deleted since: no longer news. Compared here, not in SQL – a trip's comments can outnumber SQLite's variables.
        removeMissing(accountId, trip.id, TripNews.Kind.STEP, trip.steps.map(Step::id).toSet())
        removeMissing(accountId, trip.id, TripNews.Kind.COMMENT, trip.steps.flatMap { it.comments }.map { it.id }.toSet())
    }

    private suspend fun removeMissing(accountId: String, tripId: Long, kind: TripNews.Kind, present: Set<Long>) {
        val gone = dao.itemIds(accountId, tripId, kind).filterNot(present::contains)
        if (gone.isNotEmpty()) dao.remove(accountId, kind, gone)
    }

    suspend fun markAllRead() = dao.markAllRead()

    suspend fun markRead(entry: NewsEntry) = dao.markRead(entry.accountId, entry.kind, entry.itemId)

    suspend fun remove(accountId: String, tripId: Long? = null) = dao.remove(accountId, tripId)

    private companion object {
        const val KEEP = 200
    }
}
