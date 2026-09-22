import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

export interface MediaPolicyViolation {
  file: string;
  line: number;
  rule:
    | 'missing-mode'
    | 'missing-frame'
    | 'fill-image-missing-sizes'
    | 'unbounded-fixed-width'
    | 'dynamic-background-image';
}

type MediaMode = 'cover' | 'contain' | 'natural';

const MEDIA_TAGS = new Set(['Image', 'img', 'video']);
const MEDIA_MODES = new Set<MediaMode>(['cover', 'contain', 'natural']);
const EXCLUDED_DIRECTORIES = new Set([
  '.next',
  'build',
  'dist',
  'node_modules',
]);

function jsxAttributes(
  node: ts.JsxElement | ts.JsxSelfClosingElement,
): ts.JsxAttributes {
  return ts.isJsxElement(node)
    ? node.openingElement.attributes
    : node.attributes;
}

function attribute(
  attributes: ts.JsxAttributes,
  name: string,
): ts.JsxAttribute | undefined {
  return attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText() === name,
  );
}

function literalAttributeValue(
  attributes: ts.JsxAttributes,
  name: string,
): string | undefined {
  const item = attribute(attributes, name);
  if (!item?.initializer) return undefined;
  if (ts.isStringLiteral(item.initializer)) return item.initializer.text;
  if (
    ts.isJsxExpression(item.initializer) &&
    item.initializer.expression &&
    (ts.isStringLiteral(item.initializer.expression) ||
      ts.isNoSubstitutionTemplateLiteral(item.initializer.expression))
  ) {
    return item.initializer.expression.text;
  }
  return undefined;
}

function mediaMode(attributes: ts.JsxAttributes): MediaMode | undefined {
  const value = literalAttributeValue(attributes, 'data-media-mode');
  return value && MEDIA_MODES.has(value as MediaMode)
    ? (value as MediaMode)
    : undefined;
}

interface FrameMarker {
  mode?: MediaMode;
  bounded: boolean;
}

interface StylesheetClasses {
  geometry: ReadonlySet<string>;
  positioned: ReadonlySet<string>;
  possiblyPositioned: ReadonlySet<string>;
  possiblyStatic: ReadonlySet<string>;
  importantPossiblyPositioned: ReadonlySet<string>;
  importantPossiblyStatic: ReadonlySet<string>;
  inset: ReadonlySet<string>;
  unsafeWidth: ReadonlySet<string>;
}

function hasReservedGeometry(
  attributes: ts.JsxAttributes,
  classes: StylesheetClasses,
): boolean {
  return hasUnconditionalClass(
    attributes,
    (token) => isGeometryToken(token) || classes.geometry.has(token),
  );
}

function hasContainingBlockGeometry(
  node: ts.Node,
  classes: StylesheetClasses,
): boolean {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (!ts.isJsxElement(parent) && !ts.isJsxSelfClosingElement(parent))
      continue;
    const attributes = jsxAttributes(parent);
    const classPositioned =
      hasUnconditionalClass(
        attributes,
        (token) =>
          ['relative', 'absolute', 'fixed', 'sticky'].includes(token) ||
          classes.positioned.has(token),
      ) ||
      [...MEDIA_MODES].some((mode) =>
        hasSharedMediaClass(attributes, 'mediaFrameClass', mode),
      );
    const positioning = inlinePositioning(
      attribute(attributes, 'style')?.initializer,
      {
        possible:
          classPositioned ||
          hasPossibleClass(
            attributes,
            (token) =>
              /(?:^|:)(?:relative|absolute|fixed|sticky)$/.test(token) ||
              classes.possiblyPositioned.has(token),
            'mediaFrameClass',
          ),
        guaranteed:
          classPositioned &&
          !hasPossibleClass(
            attributes,
            (token) =>
              /(?:^|:)static$/.test(token) || classes.possiblyStatic.has(token),
          ),
      },
    );
    // Stylesheet !important declarations outrank normal inline styles. Keep
    // their possible outcomes even when an inline branch says `static`.
    positioning.possible ||= hasPossibleClass(attributes, (token) =>
      classes.importantPossiblyPositioned.has(token),
    );
    positioning.guaranteed &&= !hasPossibleClass(attributes, (token) =>
      classes.importantPossiblyStatic.has(token),
    );
    if (positioning.possible) {
      if (
        !(
          hasReservedGeometry(attributes, classes) &&
          !isOversizedPixelWidth(attributes) &&
          !hasUnsafeCssWidth(attributes, classes)
        )
      )
        return false;
      // Conditional positioning must be safe both when this ancestor is the
      // containing block and when the frame still depends on a farther one.
      if (positioning.guaranteed) return true;
    }
  }
  return false;
}

function hasUnsafeCssWidth(
  attributes: ts.JsxAttributes,
  classes: StylesheetClasses,
): boolean {
  return hasPossibleClass(attributes, (token) =>
    classes.unsafeWidth.has(token),
  );
}

function hasPossibleClass(
  attributes: ts.JsxAttributes,
  token: ClassTokenTest,
  helper?: string,
): boolean {
  const initializer = attribute(attributes, 'className')?.initializer;
  if (!initializer) return false;
  let found = false;
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node) ||
      ts.isShorthandPropertyAssignment(node)
    ) {
      found ||= classTextHasToken(literalPropertyName(node.name) ?? '', token);
    }
    if (
      ts.isStringLiteralLike(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      found ||= classTextHasToken(node.text, token);
    }
    if (
      helper &&
      ts.isCallExpression(node) &&
      node.expression.getText() === helper
    )
      found = true;
    ts.forEachChild(node, visit);
  };
  visit(initializer);
  return found;
}

interface Positioning {
  possible: boolean;
  guaranteed: boolean;
}

function literalPropertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
  if (
    ts.isComputedPropertyName(name) &&
    ts.isStringLiteralLike(name.expression)
  )
    return name.expression.text;
  return undefined;
}

function inlinePositioning(
  node: ts.Node | undefined,
  fallback: Positioning,
): Positioning {
  // Missing inline declarations retain class positioning; explicit static
  // alternatives replace it and require checking a farther containing block.
  if (!node) return fallback;
  if (ts.isJsxExpression(node) || ts.isParenthesizedExpression(node))
    return inlinePositioning(node.expression, fallback);
  if (ts.isConditionalExpression(node)) {
    const whenTrue = inlinePositioning(node.whenTrue, fallback);
    const whenFalse = inlinePositioning(node.whenFalse, fallback);
    return {
      possible: whenTrue.possible || whenFalse.possible,
      guaranteed: whenTrue.guaranteed && whenFalse.guaranteed,
    };
  }
  if (ts.isObjectLiteralExpression(node)) {
    let result = fallback;
    for (const property of node.properties) {
      if (ts.isSpreadAssignment(property)) {
        result = { possible: true, guaranteed: false };
      } else if (literalPropertyName(property.name) === 'position') {
        result = ts.isPropertyAssignment(property)
          ? inlinePositioning(property.initializer, fallback)
          : { possible: true, guaranteed: false };
      } else if (
        ts.isComputedPropertyName(property.name) &&
        literalPropertyName(property.name) === undefined
      ) {
        result = { possible: true, guaranteed: false };
      }
    }
    return result;
  }
  if (ts.isStringLiteralLike(node)) {
    const guaranteed = ['relative', 'absolute', 'fixed', 'sticky'].includes(
      node.text,
    );
    return {
      possible:
        guaranteed || !['static', 'initial', 'unset'].includes(node.text),
      guaranteed,
    };
  }
  if (
    node.kind === ts.SyntaxKind.NullKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword
  )
    return fallback;
  return { possible: true, guaranteed: false };
}

function frameMarker(
  node: ts.JsxElement | ts.JsxSelfClosingElement,
  classes: StylesheetClasses,
  isMediaElement = false,
): FrameMarker | undefined {
  const attributes = jsxAttributes(node);
  if (!attribute(attributes, 'data-media-frame')) return undefined;
  const value = literalAttributeValue(attributes, 'data-media-frame');
  return {
    mode:
      value && MEDIA_MODES.has(value as MediaMode)
        ? (value as MediaMode)
        : undefined,
    bounded: Boolean(
      value &&
      MEDIA_MODES.has(value as MediaMode) &&
      !isOversizedPixelWidth(attributes) &&
      !hasUnsafeCssWidth(attributes, classes) &&
      (hasReservedGeometry(attributes, classes) ||
        (hasUnconditionalClass(attributes, (token) =>
          classes.inset.has(token),
        ) &&
          hasContainingBlockGeometry(node, classes))) &&
      (hasSharedMediaClass(attributes, 'mediaFrameClass', value) ||
        hasUnconditionalClass(attributes, 'overflow-hidden') ||
        (isMediaElement &&
          hasSharedMediaClass(attributes, 'mediaObjectClass', value))),
    ),
  };
}

function nearestAncestorFrame(
  node: ts.Node,
  classes: StylesheetClasses,
): FrameMarker | undefined {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isJsxElement(parent) || ts.isJsxSelfClosingElement(parent)) {
      const marker = frameMarker(parent, classes);
      if (marker) return marker;
    }
  }
  return undefined;
}

function hasNonEmptyAttribute(
  attributes: ts.JsxAttributes,
  name: string,
): boolean {
  const item = attribute(attributes, name);
  if (!item?.initializer) return false;
  if (ts.isStringLiteral(item.initializer))
    return item.initializer.text.trim().length > 0;
  if (!ts.isJsxExpression(item.initializer) || !item.initializer.expression)
    return false;
  const expression = item.initializer.expression;
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.text.trim().length > 0;
  }
  return true;
}

function isPositiveNumericAttribute(
  attributeNode: ts.JsxAttribute | undefined,
): boolean {
  const initializer = attributeNode?.initializer;
  if (!initializer) return false;
  if (ts.isStringLiteral(initializer)) {
    return (
      /^\d+(?:\.\d+)?$/.test(initializer.text) && Number(initializer.text) > 0
    );
  }
  if (!ts.isJsxExpression(initializer) || !initializer.expression) return false;

  let expression = initializer.expression;
  while (ts.isParenthesizedExpression(expression))
    expression = expression.expression;
  return ts.isNumericLiteral(expression) && Number(expression.text) > 0;
}

function hasIntrinsicDimensions(attributes: ts.JsxAttributes): boolean {
  return (
    isPositiveNumericAttribute(attribute(attributes, 'width')) &&
    isPositiveNumericAttribute(attribute(attributes, 'height'))
  );
}

function isFillImage(attributes: ts.JsxAttributes): boolean {
  const fill = attribute(attributes, 'fill');
  if (!fill) return false;
  if (!fill.initializer || !ts.isJsxExpression(fill.initializer)) return true;
  return fill.initializer.expression?.kind !== ts.SyntaxKind.FalseKeyword;
}

function containsBackgroundImage(style: ts.JsxAttribute): boolean {
  if (!style.initializer) return false;
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      (ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node)) &&
      node.name.getText().replaceAll(/["']/g, '') === 'backgroundImage'
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(style.initializer);
  return found;
}

type ClassTokenTest = string | ((token: string) => boolean);

function classTextHasToken(text: string, token: ClassTokenTest): boolean {
  return text
    .split(/\s+/)
    .some(
      typeof token === 'string' ? (candidate) => candidate === token : token,
    );
}

function expressionGuaranteesClassToken(
  expression: ts.Expression,
  token: ClassTokenTest,
): boolean {
  if (ts.isParenthesizedExpression(expression)) {
    return expressionGuaranteesClassToken(expression.expression, token);
  }
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return classTextHasToken(expression.text, token);
  }
  if (ts.isTemplateExpression(expression)) {
    return (
      classTextHasToken(expression.head.text, token) ||
      expression.templateSpans.some((span) =>
        classTextHasToken(span.literal.text, token),
      )
    );
  }
  if (ts.isConditionalExpression(expression)) {
    return (
      expressionGuaranteesClassToken(expression.whenTrue, token) &&
      expressionGuaranteesClassToken(expression.whenFalse, token)
    );
  }
  if (ts.isBinaryExpression(expression)) {
    return (
      expression.operatorToken.kind === ts.SyntaxKind.PlusToken &&
      (expressionGuaranteesClassToken(expression.left, token) ||
        expressionGuaranteesClassToken(expression.right, token))
    );
  }
  if (ts.isCallExpression(expression)) {
    const classCombiner = expression.expression.getText();
    return (
      ['cn', 'clsx', 'twMerge', 'mediaFrameClass', 'mediaObjectClass'].includes(
        classCombiner,
      ) &&
      expression.arguments.some((argument) =>
        expressionGuaranteesClassToken(argument, token),
      )
    );
  }
  return false;
}

function hasUnconditionalClass(
  attributes: ts.JsxAttributes,
  token: ClassTokenTest,
): boolean {
  const className = attribute(attributes, 'className');
  const initializer = className?.initializer;
  if (!initializer) return false;
  if (ts.isStringLiteral(initializer)) {
    return classTextHasToken(initializer.text, token);
  }
  return Boolean(
    ts.isJsxExpression(initializer) &&
    initializer.expression &&
    expressionGuaranteesClassToken(initializer.expression, token),
  );
}

function isGeometryToken(token: string): boolean {
  if (/^aspect-(square|video)$/.test(token)) return true;
  const ratio = /^aspect-\[(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\]$/.exec(token);
  if (ratio) return Number(ratio[1]) > 0 && Number(ratio[2]) > 0;
  const size = /^(?:size|h|min-h)-(\d+(?:\.\d+)?)$/.exec(token);
  if (size) return Number(size[1]) > 0;
  const arbitrary = /^(?:size|h|min-h)-\[(.+)\]$/.exec(token);
  return Boolean(arbitrary && isPositiveLength(arbitrary[1]));
}

function isPositiveLength(value: string): boolean {
  const length = /^(\d+(?:\.\d+)?)(?:px|rem|em|vw|vh|svh|dvh)$/.exec(
    value.trim(),
  );
  if (length) return Number(length[1]) > 0;
  const clamp = /^clamp\(([^()]+)\)$/.exec(value.trim());
  const parts = clamp?.[1].split(',');
  return Boolean(parts?.length === 3 && parts.every(isPositiveLength));
}

function stylesheetGeometryClasses(stylesheet: string): StylesheetClasses {
  // Inspect simple class rules in unconditional CSS/layers. Conditional rules,
  // descendant selectors and pseudo selectors cannot establish base geometry.
  const css = stylesheet.replace(/\/\*[\s\S]*?\*\//g, '');
  const stack: { selector: string; selectors: string[]; direct: string }[] = [];
  const declarations = new Map<string, Map<string, string>>();
  const possiblyPositioned = new Set<string>();
  const possiblyStatic = new Set<string>();
  const importantPossiblyPositioned = new Set<string>();
  const importantPossiblyStatic = new Set<string>();
  const unsafeWidth = new Set<string>();
  let segmentStart = 0;
  for (const brace of css.matchAll(/[{}]/g)) {
    const index = brace.index;
    if (brace[0] === '{') {
      const segment = css.slice(segmentStart, index);
      const lastDeclaration = segment.lastIndexOf(';');
      const parent = stack.at(-1);
      if (parent && lastDeclaration >= 0)
        parent.direct += segment.slice(0, lastDeclaration + 1);
      const selector = segment.slice(lastDeclaration + 1).trim();
      stack.push({
        selector,
        // At-rules retain their enclosing selector; a nested pseudo state
        // changes that selector without making its declarations unconditional.
        selectors: selector.startsWith('@')
          ? (parent?.selectors ?? [])
          : selector.split(',').flatMap((item) => {
              const nested = item.trim();
              return nested.startsWith('&')
                ? (parent?.selectors ?? []).map((outer) =>
                    nested.replaceAll('&', outer),
                  )
                : [nested];
            }),
        direct: '',
      });
    } else {
      const rule = stack.pop();
      if (rule) {
        rule.direct += css.slice(segmentStart, index);
        const properties = [
          ...rule.direct.matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;{}]+)/g),
        ];
        const unconditional =
          !rule.selector.startsWith('@') &&
          stack.every((parent) => /^@layer\b/.test(parent.selector));
        for (const selector of rule.selectors) {
          // Conditional rules and pseudo states can introduce a nearer
          // containing block even though they cannot prove base geometry.
          const possibleClass = /^\.([\w-]+)(?::[^\s>+~]+)?$/.exec(
            selector.trim(),
          )?.[1];
          const className = /^\.([\w-]+)$/.exec(selector.trim())?.[1];
          // Merge possible outcomes before collapsing unconditional values.
          // Source order alone cannot discard earlier !important or unlayered
          // positioning. Conservatively retain CSS alternatives across layers
          // and selectors; a guarantee requires all alternatives to position.
          if (possibleClass) {
            for (const [, name, value] of properties) {
              if (name !== 'position') continue;
              if (
                !/^(?:static|initial|unset)(?:\s*!important)?$/.test(
                  value.trim(),
                )
              ) {
                possiblyPositioned.add(possibleClass);
                if (/!important\s*$/.test(value))
                  importantPossiblyPositioned.add(possibleClass);
              }
              if (
                !/^(?:relative|absolute|fixed|sticky)(?:\s*!important)?$/.test(
                  value.trim(),
                )
              ) {
                possiblyStatic.add(possibleClass);
                if (/!important\s*$/.test(value))
                  importantPossiblyStatic.add(possibleClass);
              }
            }
          }
          if (!className) continue;
          if (
            properties.some(
              (property) =>
                [
                  'width',
                  'min-width',
                  'inline-size',
                  'min-inline-size',
                  'size',
                ].includes(property[1]) &&
                /^\d+(?:\.\d+)?px(?:\s*!important)?$/.test(
                  property[2].trim(),
                ) &&
                Number.parseFloat(property[2]) > 320,
            )
          )
            unsafeWidth.add(className);
          if (!unconditional) continue;
          const values =
            declarations.get(className) ?? new Map<string, string>();
          for (const property of properties)
            values.set(property[1], property[2].trim());
          declarations.set(className, values);
        }
      }
    }
    segmentStart = index + 1;
  }
  const geometry = new Set(
    [...declarations]
      .filter(([, values]) => {
        const ratio = values
          .get('aspect-ratio')
          ?.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
        return (
          ['height', 'min-height', 'block-size', 'min-block-size'].some(
            (name) => isPositiveLength(values.get(name) ?? ''),
          ) || Boolean(ratio && Number(ratio[1]) > 0 && Number(ratio[2]) > 0)
        );
      })
      .map(([name]) => name),
  );
  const positioned = new Set<string>();
  for (const [name, values] of declarations) {
    const position = values.get('position');
    if (!position) continue;
    if (
      /^(?:relative|absolute|fixed|sticky)(?:\s*!important)?$/.test(position)
    ) {
      positioned.add(name);
      possiblyPositioned.add(name);
    } else {
      possiblyStatic.add(name);
      if (!/^(?:static|initial|unset)(?:\s*!important)?$/.test(position))
        possiblyPositioned.add(name);
    }
  }
  return {
    geometry,
    possiblyPositioned,
    possiblyStatic,
    importantPossiblyPositioned,
    importantPossiblyStatic,
    positioned,
    inset: new Set(
      [...declarations]
        .filter(
          ([, values]) =>
            values.get('position') === 'absolute' &&
            values.get('inset') === '0',
        )
        .map(([name]) => name),
    ),
    unsafeWidth,
  };
}

function hasSharedMediaClass(
  attributes: ts.JsxAttributes,
  helper: 'mediaFrameClass' | 'mediaObjectClass',
  mode: string,
): boolean {
  const initializer = attribute(attributes, 'className')?.initializer;
  if (
    !initializer ||
    !ts.isJsxExpression(initializer) ||
    !initializer.expression
  )
    return false;

  const guaranteesHelper = (expression: ts.Expression): boolean => {
    if (ts.isParenthesizedExpression(expression))
      return guaranteesHelper(expression.expression);
    if (ts.isConditionalExpression(expression)) {
      return (
        guaranteesHelper(expression.whenTrue) &&
        guaranteesHelper(expression.whenFalse)
      );
    }
    if (!ts.isCallExpression(expression)) return false;
    const name = expression.expression.getText();
    const first = expression.arguments[0];
    if (name === helper) {
      return Boolean(first && ts.isStringLiteral(first) && first.text === mode);
    }
    return (
      ['cn', 'clsx', 'twMerge'].includes(name) &&
      expression.arguments.some(guaranteesHelper)
    );
  };
  // These helpers establish the shared clipping/shrinking boundary. A marker
  // or a conditional helper call does not establish that boundary on its own.
  return guaranteesHelper(initializer.expression);
}

function isOversizedPixelWidth(attributes: ts.JsxAttributes): boolean {
  const className = attribute(attributes, 'className');
  if (className?.initializer) {
    const classSource = className.initializer.getText();
    const widthPatterns = [
      /(?:^|[^\w-])(?:w|min-w|size)-\[(\d+(?:\.\d+)?)px\]/g,
      /\[(?:width|min-width|inline-size|min-inline-size):(\d+(?:\.\d+)?)px\]/g,
    ];
    for (const pattern of widthPatterns) {
      for (const match of classSource.matchAll(pattern)) {
        if (Number(match[1]) > 320) return true;
      }
    }
  }

  const style = attribute(attributes, 'style');
  if (!style?.initializer) return false;
  let oversized = false;
  const visit = (node: ts.Node): void => {
    if (oversized) return;
    if (!ts.isPropertyAssignment(node)) {
      ts.forEachChild(node, visit);
      return;
    }
    const name = node.name.getText().replaceAll(/["']/g, '');
    if (!['width', 'minWidth', 'inlineSize', 'minInlineSize'].includes(name)) {
      ts.forEachChild(node, visit);
      return;
    }
    const value = node.initializer;
    if (ts.isNumericLiteral(value) && Number(value.text) > 320) {
      oversized = true;
      return;
    }
    if (
      (ts.isStringLiteral(value) ||
        ts.isNoSubstitutionTemplateLiteral(value)) &&
      Number.parseFloat(value.text) > 320 &&
      /^\d+(?:\.\d+)?px$/.test(value.text.trim())
    ) {
      oversized = true;
    }
  };
  visit(style.initializer);
  return oversized;
}

export function auditResponsiveMediaSource(
  file: string,
  source: string,
  stylesheet = '',
): MediaPolicyViolation[] {
  const geometryClasses = stylesheetGeometryClasses(stylesheet);
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const violations: MediaPolicyViolation[] = [];

  const report = (node: ts.Node, rule: MediaPolicyViolation['rule']): void => {
    violations.push({
      file,
      line:
        sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
          .line + 1,
      rule,
    });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const attributes = jsxAttributes(node);
      const style = attribute(attributes, 'style');
      if (style && containsBackgroundImage(style))
        report(node, 'dynamic-background-image');

      const tagName = ts.isJsxElement(node)
        ? node.openingElement.tagName.getText(sourceFile)
        : node.tagName.getText(sourceFile);
      if (MEDIA_TAGS.has(tagName)) {
        const mode = mediaMode(attributes);
        if (!mode) report(node, 'missing-mode');

        const ownFrame = frameMarker(node, geometryClasses, true);
        const ancestorFrame = nearestAncestorFrame(node, geometryClasses);
        const frame = ownFrame ?? ancestorFrame;
        const usableFrame = frame?.bounded && frame.mode === mode;
        if (
          (!hasIntrinsicDimensions(attributes) && !usableFrame) ||
          (frame && !usableFrame)
        ) {
          report(node, 'missing-frame');
        }

        if (
          tagName === 'Image' &&
          isFillImage(attributes) &&
          !hasNonEmptyAttribute(attributes, 'sizes')
        ) {
          report(node, 'fill-image-missing-sizes');
        }

        if (
          isOversizedPixelWidth(attributes) &&
          !usableFrame &&
          !hasUnconditionalClass(attributes, 'media-shrink')
        ) {
          report(node, 'unbounded-fixed-width');
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

async function collectTsxFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (entry.isDirectory() && !EXCLUDED_DIRECTORIES.has(entry.name)) {
      files.push(...(await collectTsxFiles(path.join(directory, entry.name))));
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      files.push(path.join(directory, entry.name));
    }
  }
  return files;
}

export async function scanResponsiveMediaRenderSites(
  root: string,
): Promise<MediaPolicyViolation[]> {
  const violations: MediaPolicyViolation[] = [];
  const stylesheet = await readFile(
    path.join(root, 'app', 'globals.css'),
    'utf8',
  );
  for (const sourceDirectory of ['app', 'components']) {
    const directory = path.join(root, sourceDirectory);
    for (const file of await collectTsxFiles(directory)) {
      const source = await readFile(file, 'utf8');
      const displayFile = path.relative(root, file).replaceAll(path.sep, '/');
      violations.push(
        ...auditResponsiveMediaSource(displayFile, source, stylesheet),
      );
    }
  }
  return violations;
}
