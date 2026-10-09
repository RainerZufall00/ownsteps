package de.ownsteps.app.ui.settings

import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.foundation.text.KeyboardOptions
import androidx.core.net.toUri
import de.ownsteps.app.R
import de.ownsteps.app.api.ImmichConnection
import de.ownsteps.app.data.Account
import de.ownsteps.app.model
import de.ownsteps.app.ui.ConfirmDialog
import de.ownsteps.app.ui.FormScreen
import de.ownsteps.app.ui.Hint
import de.ownsteps.app.ui.SectionTitle
import de.ownsteps.app.ui.rememberAction
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(onClose: () -> Unit, onImmich: (accountId: String) -> Unit) {
    val context = LocalContext.current
    val model = context.model
    val accounts by model.accounts.collectAsState()
    var originalVideos by remember { mutableStateOf(model.prefs.originalVideos) }
    var signOut by remember { mutableStateOf<Account?>(null) }
    val plain = ListItemDefaults.colors(containerColor = Color.Transparent)

    FormScreen(stringResource(R.string.settings), onClose, back = true) {
        SectionTitle(stringResource(R.string.uploads))
        ListItem(
            headlineContent = { Text(stringResource(R.string.original_videos)) },
            supportingContent = { Text(stringResource(R.string.original_videos_hint)) },
            trailingContent = { Switch(originalVideos, { originalVideos = it; model.prefs.originalVideos = it }) },
            colors = plain,
        )
        // Per-app language is the system's (Android 13+), like on iOS.
        if (Build.VERSION.SDK_INT >= 33) {
            ListItem(
                headlineContent = { Text(stringResource(R.string.language)) },
                leadingContent = { Icon(Icons.Filled.Language, null) },
                colors = plain,
                modifier = Modifier.clickable {
                    context.startActivity(Intent(Settings.ACTION_APP_LOCALE_SETTINGS, "package:${context.packageName}".toUri()))
                },
            )
        }
        for (account in accounts) {
            SectionTitle(account.host)
            ListItem(headlineContent = { Text(account.displayName) }, supportingContent = account.email?.let { { Text(it) } }, colors = plain)
            if (account.isAuthor) {
                ListItem(
                    headlineContent = { Text(stringResource(R.string.immich)) },
                    leadingContent = { Icon(Icons.Filled.PhotoLibrary, null) },
                    trailingContent = { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null) },
                    colors = plain,
                    modifier = Modifier.clickable { onImmich(account.id) },
                )
            }
            ListItem(
                headlineContent = { Text(stringResource(R.string.sign_out), color = MaterialTheme.colorScheme.error) },
                leadingContent = { Icon(Icons.AutoMirrored.Filled.Logout, null, tint = MaterialTheme.colorScheme.error) },
                colors = plain,
                modifier = Modifier.clickable { signOut = account },
            )
        }
        SectionTitle(stringResource(R.string.version))
        Hint(model.appVersion)
    }

    signOut?.let { account ->
        ConfirmDialog(
            stringResource(R.string.sign_out_title), stringResource(R.string.sign_out_text, account.host), stringResource(R.string.sign_out),
            onConfirm = { model.scope.launch { model.signOut(account) } }, onDismiss = { signOut = null },
        )
    }
}

/** Connecting Immich for one account: address and API key, checked by the server before they're stored. */
@Composable
fun ImmichScreen(account: Account, onClose: () -> Unit) {
    val model = LocalContext.current.model
    var connection by remember { mutableStateOf<ImmichConnection?>(null) }
    var url by rememberSaveable { mutableStateOf("") }
    var apiKey by rememberSaveable { mutableStateOf("") }
    val action = rememberAction()

    LaunchedEffect(Unit) { action.run { connection = model.withClient(account) { it.immichConnection() } } }

    FormScreen(stringResource(R.string.immich), onClose, back = true, busy = action.busy, error = action.error) {
        val current = connection ?: return@FormScreen
        if (current.connected) {
            ListItem(headlineContent = { Text(current.url.orEmpty()) }, overlineContent = { Text(stringResource(R.string.address)) })
            current.name?.let { ListItem(headlineContent = { Text(it) }, overlineContent = { Text(stringResource(R.string.account)) }) }
            Hint(current.problem ?: stringResource(R.string.immich_key_stored))
            OutlinedButton(onClick = {
                action.run {
                    model.withClient(account) { it.disconnectImmich() }
                    connection = ImmichConnection(connected = false)
                }
            }) { Text(stringResource(R.string.disconnect)) }
        } else {
            SectionTitle(stringResource(R.string.immich_address_and_key))
            OutlinedTextField(
                url, { url = it }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.address)) },
                placeholder = { Text(stringResource(R.string.immich_placeholder)) }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, autoCorrectEnabled = false),
            )
            OutlinedTextField(
                apiKey, { apiKey = it }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.api_key)) },
                singleLine = true, visualTransformation = PasswordVisualTransformation(),
            )
            Hint(stringResource(R.string.immich_key_hint))
            Button(
                onClick = { action.run { connection = model.withClient(account) { it.connectImmich(url.trim(), apiKey.trim()) }; apiKey = "" } },
                enabled = url.isNotBlank() && apiKey.isNotBlank() && !action.busy,
                modifier = Modifier.fillMaxWidth(),
            ) { Text(stringResource(R.string.connect)) }
        }
    }
}
