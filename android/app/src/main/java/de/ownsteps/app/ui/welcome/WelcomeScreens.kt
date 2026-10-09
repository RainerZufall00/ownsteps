package de.ownsteps.app.ui.welcome

import android.content.Intent
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Dns
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import de.ownsteps.app.OidcState
import de.ownsteps.app.R
import de.ownsteps.app.api.ApiError
import de.ownsteps.app.api.Invite
import de.ownsteps.app.model
import de.ownsteps.app.ui.ErrorMessage
import de.ownsteps.app.ui.ErrorText
import de.ownsteps.app.ui.FormScreen
import de.ownsteps.app.ui.Hint
import de.ownsteps.app.ui.rememberAction

/** First screen: where is your OwnSteps server? Or follow a trip with a link, without an account. */
@Composable
fun WelcomeScreen(onServer: () -> Unit, onFollow: () -> Unit) {
    val model = LocalContext.current.model
    val notice by model.notice.collectAsState()
    var address by rememberSaveable { mutableStateOf("") }
    val action = rememberAction()
    val connect = {
        model.notice.value = null
        action.run(onSuccess = onServer) { model.pendingServer.value = model.connect(address) }
    }
    val colors = MaterialTheme.colorScheme

    Box(
        Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(colors.primaryContainer, colors.surface))),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier.safeDrawingPadding().imePadding().verticalScroll(rememberScrollState()).widthIn(max = 480.dp).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Surface(shape = CircleShape, color = colors.primary, modifier = Modifier.size(80.dp)) {
                Icon(Icons.Filled.Place, null, Modifier.padding(18.dp), tint = colors.onPrimary)
            }
            Text(stringResource(R.string.app_name), style = MaterialTheme.typography.displaySmall)
            Text(stringResource(R.string.welcome_tagline), style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
            Spacer(Modifier.height(16.dp))
            OutlinedTextField(
                value = address,
                onValueChange = { address = it },
                label = { Text(stringResource(R.string.server_address)) },
                placeholder = { Text("trips.example.com") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Go, autoCorrectEnabled = false),
                keyboardActions = KeyboardActions(onGo = { connect() }),
                supportingText = { Text(action.error ?: notice ?: stringResource(R.string.server_address_hint)) },
                isError = action.error != null,
                modifier = Modifier.fillMaxWidth(),
            )
            Button(onClick = connect, enabled = address.isNotBlank() && !action.busy, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                if (action.busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) else Text(stringResource(R.string.continue_))
            }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = onFollow) {
                Icon(Icons.Filled.PersonAdd, null, Modifier.padding(end = 8.dp))
                Text(stringResource(R.string.follow_with_link))
            }
            Text(stringResource(R.string.follow_hint), Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** Sign-in on a server that answered: OIDC first, password below ([D14]). */
@Composable
fun SignInScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val model = context.model
    val server = model.pendingServer.collectAsState().value
    if (server == null) {
        // The app was restarted in between: start over with the address.
        LaunchedEffect(Unit) { onBack() }
        return
    }
    val oidc by model.oidc.collectAsState()
    val auth = server.info.auth
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    val action = rememberAction()
    val busy = action.busy || oidc == OidcState.Running
    val signIn = { action.run { model.signIn(server, email.trim(), password) } }

    FormScreen(
        title = stringResource(R.string.sign_in),
        onClose = onBack,
        back = true,
        busy = busy,
        error = action.error ?: (oidc as? OidcState.Failed)?.error?.let { ErrorText.message(context, it) },
    ) {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(Icons.Filled.Dns, null, Modifier.size(48.dp), tint = MaterialTheme.colorScheme.primary)
            Text(server.info.name, style = MaterialTheme.typography.headlineSmall)
            Text(server.baseUrl.host, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        when {
            !server.info.setupComplete -> {
                Text(stringResource(R.string.setup_incomplete))
                OutlinedButton(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, server.url.toUri())) }) {
                    Text(stringResource(R.string.open_in_browser))
                }
            }
            !auth.oidc && !auth.password -> Text(stringResource(R.string.no_sign_in_method))
            else -> {
                if (auth.oidc) {
                    Button(
                        onClick = { CustomTabsIntent.Builder().build().launchUrl(context, model.startOidc(server).toString().toUri()) },
                        enabled = !busy,
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                    ) {
                        Icon(Icons.Filled.Key, null, Modifier.padding(end = 8.dp))
                        Text(stringResource(R.string.sign_in_with, auth.oidcLabel ?: "OIDC"))
                    }
                }
                if (auth.password) {
                    if (auth.oidc) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            HorizontalDivider(Modifier.weight(1f))
                            Text(stringResource(R.string.or_with_password), Modifier.padding(horizontal = 12.dp), style = MaterialTheme.typography.labelMedium)
                            HorizontalDivider(Modifier.weight(1f))
                        }
                    }
                    OutlinedTextField(
                        email, { email = it }, Modifier.fillMaxWidth(),
                        label = { Text(stringResource(R.string.email)) }, singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next, autoCorrectEnabled = false),
                    )
                    OutlinedTextField(
                        password, { password = it }, Modifier.fillMaxWidth(),
                        label = { Text(stringResource(R.string.password)) }, singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = { if (email.isNotBlank() && password.isNotEmpty()) signIn() }),
                    )
                    val enabled = email.isNotBlank() && password.isNotEmpty() && !busy
                    if (auth.oidc) {
                        OutlinedButton(onClick = signIn, enabled = enabled, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.sign_in)) }
                    } else {
                        Button(onClick = signIn, enabled = enabled, modifier = Modifier.fillMaxWidth().height(48.dp)) { Text(stringResource(R.string.sign_in)) }
                    }
                }
            }
        }
    }
}

/**
 * Follow a trip as a reader ([D17]): the share link (from an invitation or
 * pasted), a name for the comments and – only if the trip has one – the
 * share password. No account on the server.
 */
@Composable
fun FollowScreen(link: String?, onClose: () -> Unit) {
    val model = LocalContext.current.model
    val invite = link?.let(Invite::from)
    var text by rememberSaveable { mutableStateOf("") }
    var name by rememberSaveable { mutableStateOf(model.prefs.readerName) }
    var password by rememberSaveable { mutableStateOf("") }
    var needsPassword by rememberSaveable { mutableStateOf(false) }
    val action = rememberAction()
    val parsed = invite ?: Invite.fromText(text)

    FormScreen(
        title = stringResource(R.string.follow_trip),
        onClose = onClose,
        confirm = stringResource(R.string.follow),
        confirmEnabled = parsed != null && name.trim().length >= 2,
        busy = action.busy,
        error = action.error,
        onConfirm = {
            action.run {
                try {
                    val account = model.follow(parsed!!, name.trim(), password.takeIf { needsPassword })
                    model.openTrip.value = de.ownsteps.app.TripRoute(account.id, account.tripId!!)
                } catch (error: ApiError) {
                    // Only now it's clear the trip has a password.
                    if (error.code == "share_password_wrong" && !needsPassword) needsPassword = true else throw error
                }
            }
        },
    ) {
        if (invite != null) {
            Text(stringResource(R.string.server) + ": " + invite.serverUrl.host, style = MaterialTheme.typography.titleMedium)
        } else {
            OutlinedTextField(
                text, { text = it }, Modifier.fillMaxWidth(),
                label = { Text(stringResource(R.string.trip_link)) },
                placeholder = { Text("https://trips.example.com/s/…") },
                supportingText = { Text(stringResource(R.string.trip_link_hint)) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, autoCorrectEnabled = false),
            )
        }
        OutlinedTextField(
            name, { name = it }, Modifier.fillMaxWidth(),
            label = { Text(stringResource(R.string.your_name)) },
            supportingText = { Text(stringResource(R.string.your_name_hint)) },
            singleLine = true,
        )
        if (needsPassword) {
            OutlinedTextField(
                password, { password = it }, Modifier.fillMaxWidth(),
                label = { Text(stringResource(R.string.trip_password)) },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
            )
        }
    }
}
