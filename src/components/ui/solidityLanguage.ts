import type { Monaco } from '@monaco-editor/react'

export function registerSolidityLanguage(monaco: Monaco) {
  if (monaco.languages.getLanguages().some((language: { id: string }) => language.id === 'solidity')) return
  monaco.languages.register({ id: 'solidity' })
  monaco.languages.setMonarchTokensProvider('solidity', {
    keywords: ['abstract', 'after', 'alias', 'apply', 'as', 'assembly', 'assert', 'break', 'case', 'catch', 'constant', 'continue', 'contract', 'constructor', 'default', 'delete', 'do', 'else', 'emit', 'enum', 'error', 'event', 'external', 'fallback', 'for', 'function', 'if', 'immutable', 'import', 'indexed', 'interface', 'internal', 'is', 'library', 'mapping', 'memory', 'modifier', 'new', 'payable', 'pragma', 'private', 'public', 'pure', 'receive', 'return', 'returns', 'revert', 'selfdestruct', 'storage', 'string', 'struct', 'super', 'supports', 'switch', 'this', 'throw', 'try', 'type', 'using', 'view', 'virtual', 'while', 'calldata', 'override', 'unchecked', 'require', 'msg', 'block', 'tx'],
    typeKeywords: ['address', 'bool', 'byte', 'bytes', 'fixed', 'int', 'uint', 'var'],
    operators: ['=', '>', '<', '!', '~', '?', ':', '==', '<=', '>=', '!=', '&&', '||', '++', '--', '+', '-', '*', '/', '&', '|', '^', '%', '<<', '>>', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=', '=>'],
    symbols: new RegExp('[=><!~?:&|+*/^%]+'),
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [/[{}()[\]]/, '@brackets'],
        [/[;,.]/, 'delimiter'],
        [/@[a-zA-Z_$][\w$]*/, 'annotation'],
        [/[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?/, 'number'],
        [/[A-Z][\w$]*/, 'type.identifier'],
        [/[a-zA-Z_$][\w$]*/, { cases: { '@typeKeywords': 'type', '@keywords': 'keyword', '@default': 'identifier' } }],
        [/["']/, 'string', '@string'],
        [/@symbols/, { cases: { '@operators': 'operator', '@default': '' } }],
      ],
      comment: [[/[^/*]+/, 'comment'], [/\*\//, 'comment', '@pop'], [/[/*]/, 'comment']],
      string: [[/[^"'\\]+/, 'string'], [/\\./, 'string.escape'], [/["]/, 'string', '@pop'], [/[']/, 'string', '@pop']],
    },
  })
}
