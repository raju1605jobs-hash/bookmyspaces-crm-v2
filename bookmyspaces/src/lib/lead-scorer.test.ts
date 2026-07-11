import { describe, it, expect } from "vitest";
import { parseBudget, scoreLead } from "./lead-scorer";

describe("parseBudget", () => {
  it("parses lakh notation", () => {
    expect(parseBudget("2 lakh")).toBe(200_000);
    expect(parseBudget("1.5 lac")).toBe(150_000);
  });

  it("parses k notation", () => {
    expect(parseBudget("50k")).toBe(50_000);
  });

  it("treats small plain numbers as thousands", () => {
    expect(parseBudget("50")).toBe(50_000);
  });

  it("treats large plain numbers as-is", () => {
    expect(parseBudget("75000")).toBe(75_000);
  });

  it("returns 0 for null/empty input", () => {
    expect(parseBudget(null)).toBe(0);
    expect(parseBudget(undefined)).toBe(0);
    expect(parseBudget("")).toBe(0);
  });
});

describe("scoreLead", () => {
  it("never throws and always returns a result within 0-100", () => {
    const result = scoreLead({});
    expect(result.ai_score).toBeGreaterThanOrEqual(0);
    expect(result.ai_score).toBeLessThanOrEqual(100);
    expect(result.lead_temperature).toBe("COLD");
  });

  it("scores a high-value wedding lead as HOT", () => {
    const result = scoreLead({
      event_type: "wedding",
      guest_count: 150,
      budget: "3 lakh",
      source: "referral",
    });
    expect(result.lead_temperature).toBe("HOT");
    expect(result.ai_score).toBeGreaterThanOrEqual(70);
    expect(result.tags).toContain("HOT");
    expect(result.tags).toContain("WEDDING");
  });

  it("scores a minimal lead as COLD", () => {
    const result = scoreLead({ source: "other" });
    expect(result.lead_temperature).toBe("COLD");
  });

  it("clamps score to 100 even when component scores would overshoot", () => {
    const result = scoreLead({
      event_type: "wedding",
      guest_count: 500,
      budget: "10 lakh",
      source: "referral",
      event_date: new Date().toISOString(), // weekend bonus may apply
    });
    expect(result.ai_score).toBeLessThanOrEqual(100);
  });

  it("replaces stale temperature tags instead of duplicating them", () => {
    const result = scoreLead({
      event_type: "wedding",
      guest_count: 150,
      budget: "3 lakh",
      source: "referral",
      existing_tags: ["COLD", "VIP", "WEDDING"],
    });
    const temperatureTags = result.tags.filter((t) =>
      ["HOT", "WARM", "COLD"].includes(t)
    );
    expect(temperatureTags).toHaveLength(1);
    expect(temperatureTags[0]).toBe("HOT");
    expect(result.tags).toContain("VIP");
  });

  it("never throws on malformed input", () => {
    expect(() =>
      scoreLead({
        event_date: "not-a-date",
        guest_count: -5,
        budget: "???",
      } as any)
    ).not.toThrow();
  });
});
