/**
 * Rental policy statements that appear in more than one place.
 *
 * The driver-age rule was written out three times — the terms page, the terms
 * modal accepted at booking, and the FAQ — and the FAQ had drifted to offering
 * 18 for motorbikes and bikes while both contract texts said 21 for everything.
 * A customer ticking the terms box was accepting one rule while the FAQ
 * promised another, which is the kind of contradiction that turns into a refused
 * rental at the desk.
 *
 * Declared once here and imported everywhere, so the next edit cannot leave two
 * versions in the wild.
 */

export const MIN_DRIVER_AGE = 21;
export const YOUNG_DRIVER_BAND = "21–25";

/** The single approved sentence. Used verbatim in the terms, the booking modal and the FAQ. */
export const DRIVER_AGE_POLICY =
  `Minimum driver's age is ${MIN_DRIVER_AGE} years. A young driver surcharge may apply for drivers aged ${YOUNG_DRIVER_BAND}.`;

/** FAQ phrasing — same rule, answered as a question. */
export const DRIVER_AGE_FAQ =
  `Minimum driver's age is ${MIN_DRIVER_AGE} years for all our vehicles. A young driver surcharge may apply for drivers aged ${YOUNG_DRIVER_BAND}.`;

/** Greek rendering of the same rule. Kept beside it so the two cannot diverge. */
export const DRIVER_AGE_FAQ_EL =
  `Το ελάχιστο όριο ηλικίας οδηγού είναι ${MIN_DRIVER_AGE} ετών για όλα τα οχήματά μας. Ενδέχεται να ισχύει επιβάρυνση νέου οδηγού για οδηγούς ηλικίας ${YOUNG_DRIVER_BAND}.`;
