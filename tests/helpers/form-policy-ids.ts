import ts from 'typescript';

const checkers = new WeakMap<ts.SourceFile, ts.TypeChecker>();

function checkerFor(ast: ts.SourceFile): ts.TypeChecker {
  const existing = checkers.get(ast);
  if (existing) return existing;
  // Bind only this already-parsed source. Never load imports, project files or
  // libraries: imported/dynamic IDs must remain unknown to the source policy.
  const host: ts.CompilerHost = {
    getSourceFile: (name) => name === ast.fileName ? ast : undefined,
    getDefaultLibFileName: () => '',
    writeFile: () => undefined,
    getCurrentDirectory: () => '',
    getDirectories: () => [],
    fileExists: (name) => name === ast.fileName,
    readFile: () => undefined,
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
  };
  const checker = ts.createProgram([ast.fileName], { noLib: true, noResolve: true }, host).getTypeChecker();
  checkers.set(ast, checker);
  return checker;
}

export function resolveFormPolicyIds(initializer: ts.JsxAttributeValue | undefined,
  ast: ts.SourceFile): readonly string[] | null {
  if (!initializer) return null;
  if (ts.isStringLiteral(initializer)) return [initializer.text];
  if (!ts.isJsxExpression(initializer) || !initializer.expression) return null;
  const resolving = new Set<ts.VariableDeclaration>();
  function resolve(expression: ts.Expression): readonly string[] | null {
    if (ts.isStringLiteral(expression)) return [expression.text];
    if (ts.isConditionalExpression(expression)) {
      const yes = resolve(expression.whenTrue);
      const no = resolve(expression.whenFalse);
      return yes && no ? [...new Set([...yes, ...no])] : null;
    }
    if (!ts.isIdentifier(expression)) return null;
    const declarations = checkerFor(ast).getSymbolAtLocation(expression)?.declarations;
    if (declarations?.length !== 1) return null;
    const declaration = declarations[0];
    if (!ts.isVariableDeclaration(declaration) || !ts.isVariableDeclarationList(declaration.parent) ||
      !(declaration.parent.flags & ts.NodeFlags.Const) ||
      !declaration.initializer ||
      !(ts.isStringLiteral(declaration.initializer) || ts.isConditionalExpression(declaration.initializer)) ||
      resolving.has(declaration)) return null;
    resolving.add(declaration);
    const ids = resolve(declaration.initializer);
    resolving.delete(declaration);
    return ids;
  }
  return resolve(initializer.expression);
}
