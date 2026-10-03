import type { FormPolicy } from "@keenan/services/builder-react";
import type { BuilderCssOptions } from "@keenan/services/builder";

// ============================================================================
// This site's rendering choices for Site Builder trees — the PER-SITE half of a
// seam (deliberately NOT a shared module): the shared Builder*Page wrappers read
// it, and each site decides. A choice left out renders exactly as before.
//
// formPolicy.keepEmptyOptionValue — a "Choose…" placeholder <option value="">
//   keeps its empty value, so a required dropdown rejects the placeholder
};
