package de.ownsteps.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import de.ownsteps.app.R
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

/**
 * A calendar day, picked in a dialog. Days are plain [LocalDate]s – the
 * server's time zone is applied by the caller ([E12]), never the phone's.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DateField(label: String, date: LocalDate, onChange: (LocalDate) -> Unit, modifier: Modifier = Modifier, notBefore: LocalDate? = null) {
    var picking by remember { mutableStateOf(false) }
    ListItem(
        headlineContent = { Text(label) },
        trailingContent = { Text(date.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM))) },
        leadingContent = { Icon(Icons.Outlined.CalendarMonth, null) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = modifier.clickable { picking = true },
    )
    if (picking) {
        // The picker counts in UTC midnights.
        val earliest = notBefore?.atStartOfDay(ZoneOffset.UTC)?.toInstant()?.toEpochMilli()
        val state = rememberDatePickerState(
            initialSelectedDateMillis = date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
            selectableDates = object : androidx.compose.material3.SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long) = earliest == null || utcTimeMillis >= earliest
            },
        )
        DatePickerDialog(
            onDismissRequest = { picking = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { onChange(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()) }
                    picking = false
                }) { Text(stringResource(R.string.ok)) }
            },
            dismissButton = { TextButton(onClick = { picking = false }) { Text(stringResource(R.string.cancel)) } },
        ) { DatePicker(state) }
    }
}

/** An optional day: a switch, and the day once it's on. */
@Composable
fun OptionalDateField(label: String, date: LocalDate?, onChange: (LocalDate?) -> Unit, notBefore: LocalDate? = null) {
    ListItem(
        headlineContent = { Text(label) },
        trailingContent = { Switch(date != null, { on -> onChange(if (on) notBefore ?: LocalDate.now() else null) }) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
    )
    date?.let { DateField(stringResource(R.string.date), it, onChange, notBefore = notBefore) }
}
