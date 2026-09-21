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
}

function frameMarker(attributes: ts.JsxAttributes): FrameMarker | undefined {
  if (!attribute(attributes, 'data-media-frame')) return undefined;
  const value = literalAttributeValue(attributes, 'data-media-frame');
  return {
    mode:
      value && MEDIA_MODES.has(value as MediaMode)
        ? (value as MediaMode)
        : undefined,
  };
}

function nearestAncestorFrame(node: ts.Node): FrameMarker | undefined {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isJsxElement(parent) || ts.isJsxSelfClosingElement(parent)) {
      const marker = frameMarker(jsxAttributes(parent));
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

function hasIntrinsicDimensions(attributes: ts.JsxAttributes): boolean {
  return Boolean(
    attribute(attributes, 'width') && attribute(attributes, 'height'),
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

function hasMediaShrink(attributes: ts.JsxAttributes): boolean {
  const className = attribute(attributes, 'className');
  return Boolean(className?.initializer?.getText().match(/\bmedia-shrink\b/));
}

function isOversizedPixelWidth(attributes: ts.JsxAttributes): boolean {
  const className = attribute(attributes, 'className');
  if (className?.initializer) {
    const arbitraryWidths = className.initializer
      .getText()
      .matchAll(/(?:^|[^\w-])(?:w|min-w|max-w)-\[(\d+(?:\.\d+)?)px\]/g);
    for (const match of arbitraryWidths) {
      if (Number(match[1]) > 320) return true;
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
    if (
      ![
        'width',
        'minWidth',
        'maxWidth',
        'inlineSize',
        'minInlineSize',
        'maxInlineSize',
      ].includes(name)
    ) {
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
): MediaPolicyViolation[] {
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

        const ownFrame = frameMarker(attributes);
        const ancestorFrame = nearestAncestorFrame(node);
        const frame = ownFrame ?? ancestorFrame;
        if (
          (!hasIntrinsicDimensions(attributes) && !frame?.mode) ||
          (frame && (!frame.mode || frame.mode !== mode))
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
          !frame?.mode &&
          !hasMediaShrink(attributes)
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
  for (const sourceDirectory of ['app', 'components']) {
    const directory = path.join(root, sourceDirectory);
    for (const file of await collectTsxFiles(directory)) {
      const source = await readFile(file, 'utf8');
      const displayFile = path.relative(root, file).replaceAll(path.sep, '/');
      violations.push(...auditResponsiveMediaSource(displayFile, source));
    }
  }
  return violations;
}
