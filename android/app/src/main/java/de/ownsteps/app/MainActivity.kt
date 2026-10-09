package de.ownsteps.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.content.IntentCompat
import de.ownsteps.app.api.Invite
import de.ownsteps.app.api.OidcCallback
import de.ownsteps.app.media.MediaPreparation
import de.ownsteps.app.ui.AppNavigation
import de.ownsteps.app.ui.OwnStepsTheme
import de.ownsteps.app.ui.compose.ShareScreen
import de.ownsteps.app.work.Notifications

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (savedInstanceState == null) handle(intent)
        setContent { OwnStepsTheme { AppNavigation() } }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    override fun onStart() {
        super.onStart()
        model.resumeUploads()
    }

    override fun onResume() {
        super.onResume()
        // Back from the browser without `ownsteps://auth`: the user closed it.
        model.cancelOidc()
    }

    /** `ownsteps://auth` ends a sign-in, `ownsteps://join` is an invitation ([D18]), extras come from notifications. */
    private fun handle(intent: Intent) {
        val link = intent.data?.toString()
        when {
            link != null && OidcCallback.isCallback(link) -> model.finishOidc(link)
            link != null -> Invite.from(link)?.let { model.pendingInvite.value = it }
            intent.hasExtra(Notifications.EXTRA_TRIP) -> model.openTrip.value = TripRoute(
                accountId = intent.getStringExtra(Notifications.EXTRA_ACCOUNT) ?: return,
                tripId = intent.getLongExtra(Notifications.EXTRA_TRIP, 0),
                stepId = intent.getLongExtra(Notifications.EXTRA_STEP, 0).takeIf { it > 0 },
            )
        }
    }
}

/** Photos and videos shared from another app become a new step ([D21]). */
class ShareActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val sources = sharedUris(intent).map { MediaPreparation.Source(it) }
        setContent { OwnStepsTheme { ShareScreen(sources, onDone = ::finish) } }
    }

    private fun sharedUris(intent: Intent): List<Uri> = when (intent.action) {
        Intent.ACTION_SEND -> listOfNotNull(IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java))
        Intent.ACTION_SEND_MULTIPLE -> IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri::class.java).orEmpty()
        else -> emptyList()
    }
}
