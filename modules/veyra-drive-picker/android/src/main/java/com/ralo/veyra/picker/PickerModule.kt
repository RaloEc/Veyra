package com.ralo.veyra.picker

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.Scope
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val REQUEST_CODE_PICKER_AUTH = 9410
private const val SCOPE_DRIVE_FILE = "https://www.googleapis.com/auth/drive.file"

/**
 * PoC P4 native module using Expo Modules API (Kotlin).
 * Launches Google Play Services Identity AuthorizationClient with PICKER_OAUTH_TRIGGER
 * and returns picked_file_ids, serverAuthCode, accessToken, grantedScopes, and rawExtras.
 */
class PickerModule : Module() {
  private var pendingPromise: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("VeyraDrivePicker")

    AsyncFunction("openDrivePickerOAuth") { options: Map<String, Any?>, promise: Promise ->
      if (pendingPromise != null) {
        promise.reject(
          CodedException("E_PICKER_IN_PROGRESS", "A Drive Picker OAuth flow is already active.", null)
        )
        return@AsyncFunction
      }

      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject(
          CodedException("E_NO_ACTIVITY", "Current Android Activity is not available.", null)
        )
        return@AsyncFunction
      }

      val serverClientId = (options["serverClientId"] as? String)?.trim().orEmpty()
      val requestOffline = (options["requestOfflineAccess"] as? Boolean) ?: serverClientId.isNotEmpty()

      val requestBuilder = AuthorizationRequest.builder()
        .setRequestedScopes(listOf(Scope(SCOPE_DRIVE_FILE)))
        .setOptOutIncludingGrantedScopes(true)
        .setPrompt(AuthorizationRequest.Prompt.CONSENT)
        .addResourceParameter(
          AuthorizationRequest.ResourceParameter.PICKER_OAUTH_TRIGGER,
          "true"
        )

      if (requestOffline && serverClientId.isNotEmpty()) {
        // Passing the Web Client ID instructs Play Services to include a one-time serverAuthCode.
        requestBuilder.requestOfflineAccess(serverClientId)
      }

      val authorizationRequest = requestBuilder.build()

      Identity.getAuthorizationClient(activity)
        .authorize(authorizationRequest)
        .addOnSuccessListener { result ->
          if (result.hasResolution()) {
            val pendingIntent = result.pendingIntent
            if (pendingIntent == null) {
              promise.reject(
                CodedException(
                  "E_MISSING_PENDING_INTENT",
                  "AuthorizationResult requires resolution but pendingIntent is null.",
                  null
                )
              )
              return@addOnSuccessListener
            }

            pendingPromise = promise
            try {
              activity.startIntentSenderForResult(
                pendingIntent.intentSender,
                REQUEST_CODE_PICKER_AUTH,
                null,
                0,
                0,
                0,
                null
              )
            } catch (e: Exception) {
              pendingPromise = null
              promise.reject(
                CodedException("E_LAUNCH_RESOLUTION", "Failed to launch PendingIntent: ${e.message}", e)
              )
            }
          } else {
            promise.resolve(buildResultMap(result, intent = null, fromResolution = false))
          }
        }
        .addOnFailureListener { e ->
          promise.reject(
            CodedException("E_AUTHORIZE_FAILED", e.message ?: "AuthorizationClient.authorize failed.", e)
          )
        }
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != REQUEST_CODE_PICKER_AUTH) {
        return@OnActivityResult
      }

      val promise = pendingPromise ?: return@OnActivityResult
      pendingPromise = null

      if (payload.resultCode != Activity.RESULT_OK) {
        promise.resolve(
          mapOf(
            "cancelled" to true,
            "resultCode" to payload.resultCode,
            "picked_file_ids" to emptyList<String>(),
            "serverAuthCode" to null,
            "accessToken" to null,
            "grantedScopes" to emptyList<String>(),
            "rawExtras" to dumpExtras(payload.data?.extras, payload.data?.dataString)
          )
        )
        return@OnActivityResult
      }

      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject(
          CodedException("E_NO_ACTIVITY", "Current Activity lost before parsing AuthorizationResult.", null)
        )
        return@OnActivityResult
      }

      try {
        val intent: Intent? = payload.data
        val authResult = Identity.getAuthorizationClient(activity)
          .getAuthorizationResultFromIntent(intent)

        promise.resolve(
          buildResultMap(
            result = authResult,
            intent = intent,
            fromResolution = true
          )
        )
      } catch (e: Exception) {
        promise.reject(
          CodedException("E_PARSE_AUTH_RESULT", e.message ?: "Failed to extract AuthorizationResult from Intent.", e)
        )
      }
    }
  }

  private fun buildResultMap(
    result: AuthorizationResult,
    intent: Intent?,
    fromResolution: Boolean
  ): Map<String, Any?> {
    val intentExtras = intent?.extras
    val tokenParams = result.tokenResponseParams
    val rawExtras = dumpExtras(intentExtras, intent?.dataString).toMutableMap()
    rawExtras["_authResultString"] = result.toString()

    if (tokenParams != null) {
      for (key in tokenParams.keySet()) {
        @Suppress("DEPRECATION")
        val valObj = tokenParams.get(key)
        rawExtras["tokenResponseParams.$key"] = when (valObj) {
          is Array<*> -> valObj.joinToString(prefix = "[", postfix = "]")
          else -> valObj?.toString() ?: "null"
        }
      }
    }

    // Inspect AuthorizationResult methods/properties safely for PoC diagnostics
    try {
      val toGoogleSignIn = result.toGoogleSignInAccount()
      if (toGoogleSignIn != null) {
        rawExtras["_googleSignInAccountEmail"] = toGoogleSignIn.email ?: "null"
      }
    } catch (_: Throwable) {
      // Optional diagnostic field
    }

    val pickedFileIds = extractPickedFileIds(tokenParams).ifEmpty {
      extractPickedFileIds(intentExtras)
    }
    return mapOf(
      "cancelled" to false,
      "fromResolution" to fromResolution,
      "picked_file_ids" to pickedFileIds,
      "serverAuthCode" to result.serverAuthCode,
      "accessToken" to result.accessToken,
      "grantedScopes" to result.grantedScopes,
      "rawExtras" to rawExtras
    )
  }

  private fun extractPickedFileIds(extras: Bundle?): List<String> {
    if (extras == null) return emptyList()
    val candidateKeys = listOf("picked_file_ids", "PICKER_FILE_IDS", "file_ids")
    for (key in candidateKeys) {
      if (!extras.containsKey(key)) continue
      @Suppress("DEPRECATION")
      val value = extras.get(key)
      when (value) {
        is ArrayList<*> -> return value.mapNotNull { it?.toString() }
        is Array<*> -> return value.mapNotNull { it?.toString() }
        is String -> return if (value.isBlank()) emptyList() else value.split(",").map { it.trim() }
      }
    }
    return emptyList()
  }

  private fun dumpExtras(extras: Bundle?, dataString: String?): Map<String, String> {
    val out = mutableMapOf<String, String>()
    if (!dataString.isNullOrEmpty()) {
      out["_intentDataString"] = dataString
    }
    if (extras == null) return out
    for (key in extras.keySet()) {
      @Suppress("DEPRECATION")
      val valObj = extras.get(key)
      out[key] = when (valObj) {
        is Array<*> -> valObj.joinToString(prefix = "[", postfix = "]")
        else -> valObj?.toString() ?: "null"
      }
    }
    return out
  }
}
