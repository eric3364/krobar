export type FeatureFlagType = "boolean" | "enum" | "string" | "number";

export type FeatureFlagMeta = {
  type: FeatureFlagType;
  values?: string[];
  default: unknown;
  description: string;
};

export type FeatureFlagsResponse = Record<string, unknown> & {
  _meta: Record<string, FeatureFlagMeta>;
};
