/**
 * Pure argument parsing for `acm mcp add`.
 *
 * Kept dependency-free so it can be unit tested without pulling in the CLI
 * runtime (chalk, prompts, ...).
 */

export interface AddArgs {
  name: string;
  command: string[];
  url?: string;
  client?: string;
  cwd?: string;
  env: string[];
  /** Overwrite an existing server instead of reporting a conflict. */
  force: boolean;
  /** Preview the change without writing any config. */
  dryRun: boolean;
  /** acm's own flags that were used incorrectly, e.g. `--url` with no value. */
  errors: string[];
}

/** acm's own flags for `add`, all of which take a value. */
const VALUE_FLAGS = ["--url", "--client", "--cwd", "-e", "--env"] as const;
/** acm's own flags for `add` that take no value. */
const BOOLEAN_FLAGS = ["--force", "--dry-run"] as const;

/** Every token that means "a new flag starts here", so it cannot be a value. */
const KNOWN_FLAGS: ReadonlySet<string> = new Set([
  ...VALUE_FLAGS,
  ...BOOLEAN_FLAGS,
  "--",
]);

/**
 * Parse the tokens following `acm mcp add`.
 *
 * Recognised acm flags (--url/--client/--cwd/-e) are consumed wherever they
 * appear, in both `--flag value` and `--flag=value` forms; every other token
 * belongs to the server command, so natural invocations like `add fs npx -y pkg`
 * work without a `--` separator. A literal `--` forces the remaining tokens to
 * be treated as command args.
 *
 * A flag whose value is missing is reported through `errors` instead of being
 * silently dropped or pushed into the command — otherwise `add s -e` would
 * produce an env entry of `undefined` and fail later with a confusing error.
 */
export function parseAddArgs(tokens: string[]): AddArgs {
  const result: AddArgs = {
    name: tokens[0] ?? "",
    command: [],
    env: [],
    force: false,
    dryRun: false,
    errors: [],
  };
  const rest = tokens.slice(1);
  let literal = false;

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (literal) {
      result.command.push(token);
      continue;
    }
    if (token === "--") {
      literal = true;
      continue;
    }

    // Split `--flag=value`, but leave short flags and plain args untouched.
    const eq = token.startsWith("--") ? token.indexOf("=") : -1;
    const flag = eq === -1 ? token : token.slice(0, eq);
    const inlineValue = eq === -1 ? undefined : token.slice(eq + 1);

    if ((BOOLEAN_FLAGS as readonly string[]).includes(flag)) {
      if (flag === "--force") result.force = true;
      else result.dryRun = true;
      continue;
    }

    if (!(VALUE_FLAGS as readonly string[]).includes(flag)) {
      result.command.push(token);
      continue;
    }

    let value = inlineValue;
    if (value === undefined) {
      const next = rest[i + 1];
      // A following acm flag means the value was omitted — `--url --client x`
      // must not silently record `--client` as the URL.
      if (next === undefined || KNOWN_FLAGS.has(next)) {
        result.errors.push(`${flag} requires a value`);
        continue;
      }
      value = next;
      i++;
    }

    if (flag === "-e" || flag === "--env") result.env.push(value);
    else if (flag === "--url") result.url = value;
    else if (flag === "--client") result.client = value;
    else result.cwd = value;
  }

  return result;
}

/** Raw tokens after the `add` subcommand, taken straight from process.argv. */
export function rawAddTokens(argv: string[]): string[] {
  const mcpIdx = argv.indexOf("mcp");
  const addIdx = argv.indexOf("add", mcpIdx === -1 ? 0 : mcpIdx + 1);
  return addIdx === -1 ? [] : argv.slice(addIdx + 1);
}
