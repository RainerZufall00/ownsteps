package de.ownsteps.app.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import de.ownsteps.app.work.Notifications
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import de.ownsteps.app.data.Account
import de.ownsteps.app.model
import de.ownsteps.app.ui.compose.ComposerScreen
import de.ownsteps.app.ui.compose.EditStepScreen
import de.ownsteps.app.ui.compose.SuggestionsScreen
import de.ownsteps.app.ui.settings.ImmichScreen
import de.ownsteps.app.ui.settings.SettingsScreen
import de.ownsteps.app.ui.trip.ReadersScreen
import de.ownsteps.app.ui.trip.TripScreen
import de.ownsteps.app.ui.trip.TripSettingsScreen
import de.ownsteps.app.ui.trips.TripFormScreen
import de.ownsteps.app.ui.trips.TripListScreen
import de.ownsteps.app.ui.welcome.FollowScreen
import de.ownsteps.app.ui.welcome.SignInScreen
import de.ownsteps.app.ui.welcome.WelcomeScreen
import kotlinx.serialization.Serializable

/** The app's screens. Accounts and trips are passed by ID; screens read the rest from the model. */
object Routes {
    @Serializable data object Welcome
    @Serializable data object SignIn
    @Serializable data class Follow(val link: String? = null)
    @Serializable data object Trips
    @Serializable data class Trip(val accountId: String, val tripId: Long, val stepId: Long? = null)
    @Serializable data class TripForm(val accountId: String, val tripId: Long? = null)
    /** [assetIds]: library items preselected from the photo suggestions, comma-separated. */
    @Serializable data class Composer(val accountId: String, val tripId: Long, val stepId: Long? = null, val assetIds: String = "")
    @Serializable data class EditStep(val accountId: String, val tripId: Long, val stepId: Long)
    @Serializable data class Readers(val accountId: String, val tripId: Long)
    @Serializable data class TripSettings(val accountId: String, val tripId: Long)
    @Serializable data class Suggestions(val accountId: String, val tripId: Long)
    @Serializable data object Settings
    @Serializable data class Immich(val accountId: String)
}

/**
 * Without an account the app starts at the server address; afterwards at
 * the trips. An invitation or a tapped notification can arrive at any time.
 */
@Composable
fun AppNavigation() {
    val context = LocalContext.current
    val model = context.model
    val navController = rememberNavController()
    val keyboard = LocalSoftwareKeyboardController.current
    // A field focused on one screen must not keep the keyboard up on the next.
    DisposableEffect(navController) {
        val listener = NavController.OnDestinationChangedListener { _, _, _ -> keyboard?.hide() }
        navController.addOnDestinationChangedListener(listener)
        onDispose { navController.removeOnDestinationChangedListener(listener) }
    }
    val accounts by model.accounts.collectAsState()
    val hasAccounts = accounts.isNotEmpty()
    val start = remember { if (hasAccounts) Routes.Trips else Routes.Welcome }

    // The first sign-in leads to the trips, the last sign-out back to the start.
    var shown by remember { mutableStateOf(hasAccounts) }
    LaunchedEffect(hasAccounts) {
        if (hasAccounts == shown) return@LaunchedEffect
        shown = hasAccounts
        navController.navigate(if (hasAccounts) Routes.Trips else Routes.Welcome) {
            popUpTo(navController.graph.id) { inclusive = true }
        }
    }
    // News arrive as local notifications ([D16]); asked once there's something to follow.
    val askNotifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
    LaunchedEffect(hasAccounts) {
        if (hasAccounts && Build.VERSION.SDK_INT >= 33 && !Notifications.canPost(context)) {
            askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
    val invite by model.pendingInvite.collectAsState()
    LaunchedEffect(invite) {
        invite?.let {
            model.pendingInvite.value = null
            navController.navigate(Routes.Follow(it.shareLink))
        }
    }
    val openTrip by model.openTrip.collectAsState()
    LaunchedEffect(openTrip, hasAccounts) {
        val route = openTrip ?: return@LaunchedEffect
        if (!hasAccounts) return@LaunchedEffect
        model.openTrip.value = null
        navController.navigate(Routes.Trip(route.accountId, route.tripId, route.stepId)) { popUpTo(Routes.Trips) }
    }

    Box(Modifier.fillMaxSize()) {
        NavHost(navController, startDestination = start) {
            composable<Routes.Welcome> {
                WelcomeScreen(onServer = { navController.navigate(Routes.SignIn) }, onFollow = { navController.navigate(Routes.Follow()) })
            }
            composable<Routes.SignIn> { SignInScreen(onBack = navController::popBackStack) }
            composable<Routes.Follow> { entry ->
                FollowScreen(link = entry.toRoute<Routes.Follow>().link, onClose = navController::popBackStack)
            }
            composable<Routes.Trips> { TripListScreen(navController) }
            composable<Routes.Trip> { entry ->
                val route = entry.toRoute<Routes.Trip>()
                WithAccount(route.accountId, navController) { TripScreen(it, route.tripId, route.stepId, navController) }
            }
            composable<Routes.TripForm> { entry ->
                val route = entry.toRoute<Routes.TripForm>()
                WithAccount(route.accountId, navController) { account ->
                    TripFormScreen(account, route.tripId, onClose = navController::popBackStack) { trip ->
                        // A new trip opens right away, in place of the form.
                        if (route.tripId == null) navController.navigate(Routes.Trip(account.id, trip.id)) { popUpTo(Routes.Trips) }
                        else navController.popBackStack()
                    }
                }
            }
            composable<Routes.Composer> { entry ->
                val route = entry.toRoute<Routes.Composer>()
                WithAccount(route.accountId, navController) {
                    ComposerScreen(it, route.tripId, route.stepId, route.assetIds.split(",").mapNotNull(String::toLongOrNull), onClose = navController::popBackStack)
                }
            }
            composable<Routes.EditStep> { entry ->
                val route = entry.toRoute<Routes.EditStep>()
                WithAccount(route.accountId, navController) { EditStepScreen(it, route.tripId, route.stepId, onClose = navController::popBackStack) }
            }
            composable<Routes.Readers> { entry ->
                val route = entry.toRoute<Routes.Readers>()
                WithAccount(route.accountId, navController) { ReadersScreen(it, route.tripId, onClose = navController::popBackStack) }
            }
            composable<Routes.TripSettings> { entry ->
                val route = entry.toRoute<Routes.TripSettings>()
                WithAccount(route.accountId, navController) {
                    TripSettingsScreen(it, route.tripId, onClose = navController::popBackStack, onImmich = { navController.navigate(Routes.Immich(it.id)) })
                }
            }
            composable<Routes.Suggestions> { entry ->
                val route = entry.toRoute<Routes.Suggestions>()
                WithAccount(route.accountId, navController) { account ->
                    SuggestionsScreen(account, route.tripId, onClose = navController::popBackStack) { chosen ->
                        navController.navigate(Routes.Composer(account.id, route.tripId, assetIds = chosen.joinToString(","))) {
                            popUpTo<Routes.Suggestions> { inclusive = true }
                        }
                    }
                }
            }
            composable<Routes.Settings> {
                SettingsScreen(onClose = navController::popBackStack, onImmich = { navController.navigate(Routes.Immich(it)) })
            }
            composable<Routes.Immich> { entry ->
                WithAccount(entry.toRoute<Routes.Immich>().accountId, navController) { ImmichScreen(it, onClose = navController::popBackStack) }
            }
        }
        // Centered in the top app bar's row (64 dp), above every screen.
        UploadStatusPill(Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(top = 14.dp))
    }
}

/** Shows [content] while the account exists; once it's signed out, the screen goes. */
@Composable
private fun WithAccount(accountId: String, navController: NavHostController, content: @Composable (Account) -> Unit) {
    val accounts by LocalContext.current.model.accounts.collectAsState()
    val account = accounts.firstOrNull { it.id == accountId }
    if (account == null) LaunchedEffect(Unit) { navController.popBackStack() } else content(account)
}
