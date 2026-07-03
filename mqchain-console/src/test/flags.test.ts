import { describe, expect, it } from "vitest";

import {
  FLAG_BITS,
  activeFlagDefinitions,
  applyMetricEligibilityToFlags,
  buildDefaultFlags,
  clearFlag,
  hasFlag,
  isHistoricalLabel,
  markHistoricalOnlyFlags,
  setFlag,
} from "@/lib/mqchain/flags";
import { LABEL_STATUS } from "@/lib/mqchain/constants";

describe("flag helpers", () => {
  it("sets and clears bit flags", () => {
    const flags = setFlag(0, FLAG_BITS.metricEligible);

    expect(hasFlag(flags, FLAG_BITS.metricEligible)).toBe(true);
    expect(hasFlag(clearFlag(flags, FLAG_BITS.metricEligible), FLAG_BITS.metricEligible)).toBe(false);
  });

  it("builds default metric and protocol flags", () => {
    const flags = buildDefaultFlags("protocol_pool", 3, true);

    expect(hasFlag(flags, FLAG_BITS.metricEligible)).toBe(true);
    expect(hasFlag(flags, FLAG_BITS.protocolRoot)).toBe(true);
    expect(hasFlag(flags, FLAG_BITS.assetContainer)).toBe(true);
  });

  it("marks historical-only labels inactive and metric-ineligible", () => {
    const activeMetricFlags = setFlag(setFlag(0, FLAG_BITS.activeLabel), FLAG_BITS.metricEligible);
    const flags = markHistoricalOnlyFlags(activeMetricFlags);

    expect(hasFlag(flags, FLAG_BITS.historicalOnly)).toBe(true);
    expect(hasFlag(flags, FLAG_BITS.activeLabel)).toBe(false);
    expect(hasFlag(flags, FLAG_BITS.metricEligible)).toBe(false);
  });

  it("treats inactive historical label status as the canonical historical state", () => {
    expect(isHistoricalLabel({ labelStatus: LABEL_STATUS.inactiveHistorical, flags: 0 })).toBe(true);
    expect(isHistoricalLabel({ labelStatus: LABEL_STATUS.activeCurrent, flags: setFlag(0, FLAG_BITS.historicalOnly) })).toBe(true);
    expect(isHistoricalLabel({ labelStatus: LABEL_STATUS.activeCurrent, flags: 0 })).toBe(false);
  });

  it("applies explicit metric eligibility without disturbing other flags", () => {
    const reviewed = setFlag(0, FLAG_BITS.manualReviewed);
    const eligible = applyMetricEligibilityToFlags(reviewed, true);
    const ineligible = applyMetricEligibilityToFlags(eligible, false);

    expect(hasFlag(eligible, FLAG_BITS.metricEligible)).toBe(true);
    expect(hasFlag(eligible, FLAG_BITS.manualReviewed)).toBe(true);
    expect(hasFlag(ineligible, FLAG_BITS.metricEligible)).toBe(false);
    expect(hasFlag(ineligible, FLAG_BITS.manualReviewed)).toBe(true);
  });

  it("maps active bits to stable display labels", () => {
    const flags = setFlag(setFlag(0, FLAG_BITS.metricEligible), FLAG_BITS.hasSecondaryRoles);

    expect(activeFlagDefinitions(flags).map((flag) => [flag.bit, flag.label])).toEqual([
      [0, "metric eligible"],
      [12, "secondary roles"],
    ]);
  });
});
