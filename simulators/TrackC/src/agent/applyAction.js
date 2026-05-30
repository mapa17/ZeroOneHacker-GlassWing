/** Map parsed LLM actions onto funnel engine state. */

export function applyAction(engine, action) {
  if (!action || action.action === "leave" || action.action === "pause") return { applied: false };

  switch (action.action) {
    case "select_coverage":
      engine.patchForm({
        coverage: {
          arzt: !!action.arzt,
          krankenhaus: !!action.krankenhaus,
        },
      });
      return { applied: true, type: "select_coverage" };

    case "select_insured_person":
      engine.patchForm({ insuredPerson: action.insuredPerson });
      return { applied: true, type: "select_insured_person" };

    case "fill_fields": {
      const patch = { ...action };
      delete patch.action;
      if (patch.svnummer) patch.svnummer = String(patch.svnummer).replace(/\D/g, "").slice(0, 10);
      engine.patchForm(patch);
      return { applied: true, type: "fill_fields", fields: Object.keys(patch) };
    }

    case "select_tarif":
      engine.patchForm({ tarif: action.tarif });
      return { applied: true, type: "select_tarif", tarif: action.tarif };

    case "toggle_addons":
      engine.patchForm({ addons: { ...engine.form.addons, ...action.addons } });
      return { applied: true, type: "toggle_addons", addons: action.addons };

    case "proceed":
      return { applied: false, type: "proceed" };

    case "back":
      engine.goBack();
      return { applied: true, type: "back" };

    case "continue_thinking":
      return { applied: false, type: "continue_thinking", note: action.note || null };

    default:
      return { applied: false };
  }
}
