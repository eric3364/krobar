export type LucideIconMetadata = {
  name: string;
  tags: string[];
  categories: string[];
  aliases: string[];
};

export type LucideCatalog = {
  version: string;
  icons: Record<string, LucideIconMetadata>;
};
