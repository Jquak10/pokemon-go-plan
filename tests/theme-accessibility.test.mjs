import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const styles =
  readFileSync(
    new URL(
      "../public/styles.css",
      import.meta.url
    ),
    "utf8"
  );

function blockFor(
  selector
) {
  const start =
    styles.indexOf(
      selector
    );

  assert.notEqual(
    start,
    -1,
    `Missing CSS block ${selector}`
  );

  const open =
    styles.indexOf(
      "{",
      start
    );

  let depth = 0;

  for (
    let index = open;
    index < styles.length;
    index += 1
  ) {
    if (
      styles[index] === "{"
    ) {
      depth += 1;
    } else if (
      styles[index] === "}"
    ) {
      depth -= 1;

      if (
        depth === 0
      ) {
        return styles.slice(
          open + 1,
          index
        );
      }
    }
  }

  throw new Error(
    `Unclosed CSS block ${selector}`
  );
}

function variablesFrom(
  block
) {
  const variables =
    new Map();

  for (
    const match of
      block.matchAll(
        /--([a-z0-9-]+)\s*:\s*([^;]+);/gi
      )
  ) {
    variables.set(
      match[1],
      match[2].trim()
    );
  }

  return variables;
}

const light =
  variablesFrom(
    blockFor(":root")
  );
const dark =
  new Map(
    light
  );

for (
  const [name, value] of
    variablesFrom(
      blockFor(
        'html[data-theme="dark"]'
      )
    )
) {
  dark.set(
    name,
    value
  );
}

function parseColor(
  value
) {
  const normalized =
    value.trim();

  if (
    /^#[0-9a-f]{6}$/i.test(
      normalized
    )
  ) {
    return {
      red:
        Number.parseInt(
          normalized.slice(
            1,
            3
          ),
          16
        ) / 255,
      green:
        Number.parseInt(
          normalized.slice(
            3,
            5
          ),
          16
        ) / 255,
      blue:
        Number.parseInt(
          normalized.slice(
            5,
            7
          ),
          16
        ) / 255,
      alpha: 1
    };
  }

  const rgba =
    normalized.match(
      /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?))?\s*\)$/i
    );

  if (rgba) {
    return {
      red:
        Number(
          rgba[1]
        ) / 255,
      green:
        Number(
          rgba[2]
        ) / 255,
      blue:
        Number(
          rgba[3]
        ) / 255,
      alpha:
        rgba[4] ===
          undefined
          ? 1
          : Number(
              rgba[4]
            )
    };
  }

  throw new Error(
    `Unsupported accessibility-test color: ${value}`
  );
}

function composite(
  foreground,
  background
) {
  const alpha =
    foreground.alpha +
    background.alpha *
      (1 -
        foreground.alpha);

  if (
    alpha === 0
  ) {
    return {
      red: 0,
      green: 0,
      blue: 0,
      alpha: 0
    };
  }

  return {
    red:
      (
        foreground.red *
          foreground.alpha +
        background.red *
          background.alpha *
          (1 -
            foreground.alpha)
      ) /
      alpha,
    green:
      (
        foreground.green *
          foreground.alpha +
        background.green *
          background.alpha *
          (1 -
            foreground.alpha)
      ) /
      alpha,
    blue:
      (
        foreground.blue *
          foreground.alpha +
        background.blue *
          background.alpha *
          (1 -
            foreground.alpha)
      ) /
      alpha,
    alpha
  };
}

function channelLuminance(
  channel
) {
  return channel <=
    0.04045
    ? channel / 12.92
    : Math.pow(
        (
          channel +
          0.055
        ) /
          1.055,
        2.4
      );
}

function luminance(
  color
) {
  return (
    0.2126 *
      channelLuminance(
        color.red
      ) +
    0.7152 *
      channelLuminance(
        color.green
      ) +
    0.0722 *
      channelLuminance(
        color.blue
      )
  );
}

function contrast(
  foreground,
  background
) {
  const first =
    luminance(
      foreground
    );
  const second =
    luminance(
      background
    );
  const lighter =
    Math.max(
      first,
      second
    );
  const darker =
    Math.min(
      first,
      second
    );

  return (
    lighter +
    0.05
  ) /
    (
      darker +
      0.05
    );
}

function tokenColor(
  theme,
  name
) {
  assert.ok(
    theme.has(
      name
    ),
    `Missing theme token --${name}`
  );

  return parseColor(
    theme.get(
      name
    )
  );
}

function opaqueBackground(
  theme,
  name,
  baseName =
    "surface"
) {
  const color =
    tokenColor(
      theme,
      name
    );

  if (
    color.alpha === 1
  ) {
    return color;
  }

  return composite(
    color,
    tokenColor(
      theme,
      baseName
    )
  );
}

function assertTokenContrast(
  {
    themeName,
    theme,
    foreground,
    background,
    minimum = 4.5,
    backgroundBase
  }
) {
  const ratio =
    contrast(
      tokenColor(
        theme,
        foreground
      ),
      opaqueBackground(
        theme,
        background,
        backgroundBase
      )
    );

  assert.ok(
    ratio >= minimum,
    `${themeName} --${foreground} on --${background} contrast ${ratio.toFixed(2)} is below ${minimum}:1`
  );
}

const textPairs = [
  [
    "ink",
    "page-bg"
  ],
  [
    "muted",
    "page-bg"
  ],
  [
    "text-subtle",
    "page-bg"
  ],
  [
    "ink",
    "surface"
  ],
  [
    "ink",
    "surface-raised"
  ],
  [
    "ink",
    "input-bg"
  ],
  [
    "input-placeholder",
    "input-bg"
  ],
  [
    "control-soft-ink",
    "control-soft-bg"
  ],
  [
    "success-ink",
    "success-soft"
  ],
  [
    "warning-ink",
    "warning-soft"
  ],
  [
    "danger-ink",
    "danger-soft"
  ],
  [
    "info-ink",
    "info-soft"
  ],
  [
    "violet-ink",
    "violet-soft"
  ]
];

for (
  const [
    themeName,
    theme
  ] of [
    [
      "Light",
      light
    ],
    [
      "Dark",
      dark
    ]
  ]
) {
  for (
    const [
      foreground,
      background
    ] of textPairs
  ) {
    assertTokenContrast({
      themeName,
      theme,
      foreground,
      background
    });
  }

  for (
    const background of [
      "page-bg",
      "surface",
      "surface-raised"
    ]
  ) {
    const ratio =
      contrast(
        tokenColor(
          theme,
          "go-blue"
        ),
        opaqueBackground(
          theme,
          background
        )
      );

    assert.ok(
      ratio >= 3,
      `${themeName} focus blue against --${background} contrast ${ratio.toFixed(2)} is below the 3:1 non-text threshold`
    );
  }

  const white =
    parseColor(
      "#ffffff"
    );

  for (
    const background of [
      "go-blue",
      "go-blue-deep"
    ]
  ) {
    const ratio =
      contrast(
        white,
        tokenColor(
          theme,
          background
        )
      );

    assert.ok(
      ratio >= 4.5,
      `${themeName} selected-navigation/primary-action white on --${background} contrast ${ratio.toFixed(2)} is below 4.5:1`
    );
  }
}

const disabledRule =
  styles.match(
    /button:disabled\s*\{([\s\S]*?)\}/
  )?.[1] || "";

const disabledOpacity =
  Number(
    disabledRule.match(
      /opacity\s*:\s*([\d.]+)/
    )?.[1]
  );

assert.ok(
  disabledOpacity >= 0.5 &&
    disabledOpacity < 1,
  "Disabled buttons must remain visibly present while distinguishable from enabled controls"
);

assert.match(
  styles,
  /BL-040 — ACCESSIBLE SEMANTIC APPEARANCE \+ SHARED THEME SURFACES · v44/,
  "Shared stylesheet must record the BL-040 accessibility generation"
);

console.log(
  "theme accessibility contrast checks passed"
);
