export interface RevnixPlugin {
  echo(options: { value: string }): Promise<{ value: string }>;
}
