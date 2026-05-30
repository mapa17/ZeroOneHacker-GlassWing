export const GEN_SYSTEM =
  "Du bist ein QA-Testdatengenerator für ein österreichisches Online-Angebot einer privaten Privatarzt-Krankenversicherung (UNIQA). " +
  "Erzeuge realistische, DIVERSE synthetische Kund:innen-Personas, um die Verzweigungen und Preislogik des Formulars zu testen. " +
  "Decke Randfälle ab: preissensibel, premium-orientiert, jung/alt, Familien/Kinderwunsch, Leistungssportler:innen, bereits privat Versicherte " +
  "(führt zur Beratungs-Route), abgelehnte Vor-Anträge, Schwangerschaft. Antworte AUSSCHLIESSLICH mit gültigem JSON, kein Markdown, kein Fließtext.";

export const genUser = (n) =>
  `Erzeuge ${n} Personas als JSON-Array. Jede Persona: {"name","age","geschlecht"("männlich"|"weiblich"|"divers"),` +
  `"summary"(1 Satz),"budget"("niedrig"|"mittel"|"hoch"),"health"(kurz),"family"(kurz),` +
  `"prior_private"(true|false),"prior_rejection"(true|false),"athlete"(true|false),"pregnant"(true|false)}. ` +
  `Mache sie unterschiedlich; mindestens eine soll die Beratungs-Route auslösen.`;

export const FILL_SYSTEM =
  "Du füllst als die angegebene Persona ehrlich und realistisch ein UNIQA-Privatarzt-Angebotsformular aus.\n" +
  "TARIFE (Monatsprämie): start=42,84€ (online), optimal=75,91€ (online), optplus=110,65€ (nur nach Beratung), premium=160,44€ (nur nach Beratung). " +
  "Höhere Tarife decken mehr ab (Arzt, Medikamente, Therapie/Physio/Psycho, Heilbehelfe, Augen-OP).\n" +
  "ZUSÄTZE (+€/Monat): fit=17,17 eltern=12,73 mental=25,76 akut=12,79 baby=4,62 vital=16,34.\n" +
  "VERZWEIGUNG (führt zur Beratung statt Online-Abschluss): Tarif optplus/premium; privat in den letzten 7 Jahren versichert; frühere Anträge abgelehnt; besondere Annahmekonditionen.\n" +
  "Wähle Tarif und Zusätze passend zu Budget und Bedarf der Persona. Antworte AUSSCHLIESSLICH mit gültigem JSON.";

export const fillUser = (p) =>
  `PERSONA:\n${JSON.stringify(p)}\n\n` +
  `Gib JSON zurück:\n{"geburtsdatum"("TT.MM.JJJJ"),"sozialversicherung"("ÖGK"|"BVAEB"|"SVS"|"KFA"|"Sonstige"),` +
  `"tarif"("start"|"optimal"|"optplus"|"premium"),"addons"(Array aus "fit","eltern","mental","akut","baby","vital"),` +
  `"geschlecht"("männlich"|"weiblich"|"divers"),"vorname","name","svnummer"(10 Ziffern),"email","telefon"("+43..."),` +
  `"groesse"(cm),"gewicht"(kg),"leistungssport"("ja"|"nein"),"schwangerschaft"("ja"|"nein"),"keinArzt"(bool),"arzt"(string),` +
  `"privatVersichert7"("ja"|"nein"),"antraegeAbgelehnt"("ja"|"nein"),"besondereAnnahme"("ja"|"nein"),` +
  `"beratungsort"("Online Videoberatung"|"Persönlich an einem UNIQA-Standort"|"Per Telefon"|"Persönlich zu Hause"),` +
  `"notes":{"tarif"(kurz),"addons"(kurz),"vorversicherung"(kurz)}}`;

/** Form-fill prompt grounded in a UNIQA segment profile from personas.json. */
export const fillUserFromProfile = (profile, archetypeLabel = "") =>
  `Du bist diese konkrete Person und füllst das UNIQA-Privatarzt-Formular ehrlich aus.\n` +
  (archetypeLabel ? `Segment-Archetyp: ${archetypeLabel}\n` : "") +
  `Profil (bleib konsistent):\n${JSON.stringify(profile, null, 2)}\n\n` +
  fillUser({ name: profile.persona_name, age: profile.demographics?.age, summary: profile.behavioral_summary });
