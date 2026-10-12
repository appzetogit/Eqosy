/**
 * Geolocation error analysis and helper utilities
 */

export function analyzeGeolocationError(error) {
  if (!error) {
    return {
      type: "UNKNOWN",
      isGpsOff: false,
      isPermissionDenied: false,
      isTimeout: false,
      title: "Location praapt nahi ho saki",
      message: "Kripya mobile location (GPS) on karein aur dobara koshish karein.",
    };
  }

  const code = typeof error === "object" ? error.code : null;
  const rawMsg = String(
    (typeof error === "object" ? error.message : error) || ""
  ).toLowerCase();

  // Code 2 = POSITION_UNAVAILABLE
  // This is the standard code fired on mobile/desktop browsers when device GPS is turned OFF
  // or network position provider is disabled.
  const isGpsOff =
    code === 2 ||
    rawMsg.includes("unavailable") ||
    rawMsg.includes("position acquisition failed") ||
    rawMsg.includes("location provider") ||
    rawMsg.includes("provider disabled") ||
    rawMsg.includes("device location") ||
    rawMsg.includes("turn on") ||
    rawMsg.includes("gps disabled") ||
    rawMsg.includes("location disabled");

  // Code 1 = PERMISSION_DENIED
  const isPermissionDenied =
    code === 1 ||
    rawMsg.includes("denied") ||
    rawMsg.includes("permission");

  // Code 3 = TIMEOUT
  const isTimeout =
    code === 3 ||
    rawMsg.includes("timeout") ||
    rawMsg.includes("timed out");

  if (isGpsOff) {
    return {
      type: "GPS_OFF",
      isGpsOff: true,
      isPermissionDenied: false,
      isTimeout: false,
      title: "Phone Ki Location (GPS) Band Hai",
      subtitle: "Turn On Device Location",
      message:
        "Aapke mobile ki location (GPS) band hai. Sahi location fetch karne ke liye kripya pehle apne device ki location chalu karein.",
      toastMessage:
        "Aapke phone ki location (GPS) band hai. Kripya pehle device location chalu karein.",
      instructionSteps: [
        "Apne mobile ka notification bar (Quick Settings) niche swipe karein.",
        "'Location' ya 'GPS' icon par tap karke use Turn ON karein.",
        "Wapas aakar 'Dobara Koshish Karein' button dabayein.",
      ],
      raw: error,
    };
  }

  if (isPermissionDenied) {
    return {
      type: "PERMISSION_DENIED",
      isGpsOff: false,
      isPermissionDenied: true,
      isTimeout: false,
      title: "Location Permission Chahiye",
      subtitle: "Location Permission Required",
      message:
        "Browser me location access blocked hai. Kripya browser settings se is website ke liye location allow karein.",
      toastMessage:
        "Location permission blocked hai. Kripya browser settings se location allow karein.",
      instructionSteps: [
        "Browser ke address bar me lock ya settings icon par tap karein.",
        "'Site Settings' ya 'Permissions' me 'Location' ko Allow karein.",
        "Page reload karein ya 'Dobara Koshish Karein' dabayein.",
      ],
      raw: error,
    };
  }

  if (isTimeout) {
    return {
      type: "TIMEOUT",
      isGpsOff: false,
      isPermissionDenied: false,
      isTimeout: true,
      title: "Location Request Timed Out",
      subtitle: "Signal Kamzor Hai / Timed Out",
      message:
        "Location fetch karne me samay lag raha hai. Kripya check karein ki device GPS on hai aur signal sahi hai.",
      toastMessage:
        "Location request timed out. Kripya mobile GPS on karke dobara koshish karein.",
      instructionSteps: [
        "Phone settings me check karein ki GPS 'High Accuracy' mode par ho.",
        "Khuli jagah par aayein ya thoda wait karein.",
        "'Dobara Koshish Karein' button dabayein.",
      ],
      raw: error,
    };
  }

  return {
    type: "GENERAL_ERROR",
    isGpsOff: false,
    isPermissionDenied: false,
    isTimeout: false,
    title: "Location Praapt Nahi Ho Saki",
    subtitle: "Could Not Fetch Location",
    message:
      "Aapki vartamaan location praapt nahi ho saki. Kripya check karein ki phone location on hai.",
    toastMessage:
      "Location praapt nahi ho saki. Kripya phone GPS on karein aur try karein.",
    instructionSteps: [
      "Check karein ki mobile data / Wi-Fi aur GPS dono on hain.",
      "'Dobara Koshish Karein' button dabayein.",
    ],
    raw: error,
  };
}

export function getFriendlyLocationErrorText(error) {
  const analysis = analyzeGeolocationError(error);
  return analysis.toastMessage || analysis.message;
}
