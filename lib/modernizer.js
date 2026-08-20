export function modernizePerl(perlCode, targetLanguage = 'python') {
  if (!perlCode) return '';

  let code = perlCode;
  
  if (targetLanguage === 'python') {
    const rules = [
      // Basic formatting and boilerplate
      { regex: /^use\s+strict;/gm, replacement: '# use strict;' },
      { regex: /^use\s+warnings;/gm, replacement: '# use warnings;' },
      { regex: /^use\s+.+?;/gm, replacement: '# $& (Python import needed)' },
      
      // Print statements
      { regex: /print\s+(["'].*?["'])(?:\s*\.\s*(.+?))?\s*;/g, replacement: (match, p1, p2) => {
        if (p2) return `print(${p1} + ${p2})`;
        return `print(${p1})`;
      }},
      { regex: /print\s+([^"';]+?)\s*;/g, replacement: 'print($1)' },
      
      // Variable declarations and assignment
      { regex: /my\s+\$([a-zA-Z0-9_]+)\s*=\s*(.+?);/g, replacement: '$1 = $2' },
      { regex: /\$([a-zA-Z0-9_]+)\s*=\s*(.+?);/g, replacement: '$1 = $2' },
      { regex: /my\s+@([a-zA-Z0-9_]+)\s*=\s*\((.*?)\);/g, replacement: '$1 = [$2]' },
      { regex: /my\s+%([a-zA-Z0-9_]+)\s*=\s*\((.*?)\);/g, replacement: '$1 = {$2}' },

      // Variable access
      { regex: /\$([a-zA-Z0-9_]+)/g, replacement: '$1' },
      { regex: /@([a-zA-Z0-9_]+)/g, replacement: '$1' },
      { regex: /%([a-zA-Z0-9_]+)/g, replacement: '$1' },

      // String concatenation
      { regex: /\s+\.\s+/g, replacement: ' + ' },

      // Loops and I/O
      { regex: /open\s*\(\s*my\s+(.+?)\s*,\s*["']<["']\s*,\s*(.+?)\s*\)\s*(?:or\s+die.*?)?;/g, replacement: 'with open($2, "r") as $1:' },
      { regex: /open\s*\(\s*my\s+(.+?)\s*,\s*["']>["']\s*,\s*(.+?)\s*\)\s*(?:or\s+die.*?)?;/g, replacement: 'with open($2, "w") as $1:' },
      { regex: /while\s*\(\s*my\s+(.+?)\s*=\s*<(.+?)>\s*\)\s*\{/g, replacement: 'for $1 in $2:' },
      { regex: /chomp\s*\((.+?)\);/g, replacement: '$1 = $1.strip()' },
      { regex: /split\s*\(\s*\/(.+?)\/\s*,\s*(.+?)\s*\)/g, replacement: '$2.split("$1")' },
      
      // Conditionals
      { regex: /if\s*\((.+?)\)\s*\{/g, replacement: 'if $1:' },
      { regex: /elsif\s*\((.+?)\)\s*\{/g, replacement: 'elif $1:' },
      { regex: /else\s*\{/g, replacement: 'else:' },
      
      // Operators
      { regex: /\s+eq\s+/g, replacement: ' == ' },
      { regex: /\s+ne\s+/g, replacement: ' != ' },
      { regex: /\s+lt\s+/g, replacement: ' < ' },
      { regex: /\s+gt\s+/g, replacement: ' > ' },
      { regex: /\s+le\s+/g, replacement: ' <= ' },
      { regex: /\s+ge\s+/g, replacement: ' >= ' },

      // End bracket removal for loops/conditionals
      { regex: /^\s*\}\s*$/gm, replacement: '' }
    ];

    rules.forEach(({ regex, replacement }) => {
      code = code.replace(regex, replacement);
    });
    
    return code;
  }
  
  if (targetLanguage === 'r') {
    const rules = [
      // Basic formatting and boilerplate
      { regex: /^use\s+strict;/gm, replacement: '# use strict' },
      { regex: /^use\s+warnings;/gm, replacement: '# use warnings' },
      
      // Print statements
      { regex: /print\s+(["'].*?["'])(?:\s*\.\s*(.+?))?\s*;/g, replacement: (match, p1, p2) => {
        if (p2) return `cat(paste0(${p1}, ${p2}, "\\n"))`;
        return `cat(${p1}, "\\n")`;
      }},
      { regex: /print\s+([^"';]+?)\s*;/g, replacement: 'cat($1, "\\n")' },
      
      // Variable declarations
      { regex: /my\s+\$([a-zA-Z0-9_]+)\s*=\s*(.+?);/g, replacement: '$1 <- $2' },
      { regex: /my\s+@([a-zA-Z0-9_]+)\s*=\s*\((.*?)\);/g, replacement: '$1 <- c($2)' },
      { regex: /my\s+%([a-zA-Z0-9_]+)\s*=\s*\((.*?)\);/g, replacement: '$1 <- list($2)' },

      // Variable access
      { regex: /\$([a-zA-Z0-9_]+)/g, replacement: '$1' },
      { regex: /@([a-zA-Z0-9_]+)/g, replacement: '$1' },
      { regex: /%([a-zA-Z0-9_]+)/g, replacement: '$1' },

      // String concatenation
      { regex: /\s+\.\s+/g, replacement: ', ' },

      // Loops and I/O
      { regex: /open\s*\(\s*my\s+(.+?)\s*,\s*["']<["']\s*,\s*(.+?)\s*\)\s*(?:or\s+die.*?)?;/g, replacement: '$1 <- file($2, "r")' },
      { regex: /open\s*\(\s*my\s+(.+?)\s*,\s*["']>["']\s*,\s*(.+?)\s*\)\s*(?:or\s+die.*?)?;/g, replacement: '$1 <- file($2, "w")' },
      { regex: /while\s*\(\s*my\s+(.+?)\s*=\s*<(.+?)>\s*\)\s*\{/g, replacement: 'while(length($1 <- readLines($2, n = 1)) > 0) {' },
      { regex: /chomp\s*\((.+?)\);/g, replacement: '$1 <- trimws($1)' },
      { regex: /split\s*\(\s*\/(.+?)\/\s*,\s*(.+?)\s*\)/g, replacement: 'strsplit($2, "$1")[[1]]' },
      
      // Operators
      { regex: /\s+eq\s+/g, replacement: ' == ' },
      { regex: /\s+ne\s+/g, replacement: ' != ' }
    ];

    rules.forEach(({ regex, replacement }) => {
      code = code.replace(regex, replacement);
    });
    
    return code;
  }

  if (targetLanguage === 'java') {
    const rules = [
      // Basic formatting and boilerplate
      { regex: /^use\s+strict;/gm, replacement: '// use strict;' },
      { regex: /^use\s+warnings;/gm, replacement: '// use warnings;' },
      
      // Print statements
      { regex: /print\s+(["'].*?["'])(?:\s*\.\s*(.+?))?\s*;/g, replacement: (match, p1, p2) => {
        if (p2) return `System.out.println(${p1} + ${p2});`;
        return `System.out.println(${p1});`;
      }},
      { regex: /print\s+([^"';]+?)\s*;/g, replacement: 'System.out.println($1);' },
      
      // Variable declarations
      { regex: /my\s+\$([a-zA-Z0-9_]+)\s*=\s*(.+?);/g, replacement: 'var $1 = $2;' },
      { regex: /my\s+@([a-zA-Z0-9_]+)\s*=\s*\((.*?)\);/g, replacement: 'var $1 = new String[]{$2};' },
      { regex: /my\s+%([a-zA-Z0-9_]+)\s*=\s*\((.*?)\);/g, replacement: 'var $1 = new HashMap<String, String>();' },

      // Variable access
      { regex: /\$([a-zA-Z0-9_]+)/g, replacement: '$1' },
      { regex: /@([a-zA-Z0-9_]+)/g, replacement: '$1' },
      { regex: /%([a-zA-Z0-9_]+)/g, replacement: '$1' },

      // String concatenation
      { regex: /\s+\.\s+/g, replacement: ' + ' },

      // Loops and I/O
      { regex: /open\s*\(\s*my\s+(.+?)\s*,\s*["']<["']\s*,\s*(.+?)\s*\)\s*(?:or\s+die.*?)?;/g, replacement: 'BufferedReader $1 = new BufferedReader(new FileReader($2));' },
      { regex: /open\s*\(\s*my\s+(.+?)\s*,\s*["']>["']\s*,\s*(.+?)\s*\)\s*(?:or\s+die.*?)?;/g, replacement: 'BufferedWriter $1 = new BufferedWriter(new FileWriter($2));' },
      { regex: /while\s*\(\s*my\s+(.+?)\s*=\s*<(.+?)>\s*\)\s*\{/g, replacement: 'String $1;\nwhile (($1 = $2.readLine()) != null) {' },
      { regex: /chomp\s*\((.+?)\);/g, replacement: '$1 = $1.trim();' },
      { regex: /split\s*\(\s*\/(.+?)\/\s*,\s*(.+?)\s*\)/g, replacement: '$2.split("$1")' },
      
      // Operators
      { regex: /\s+eq\s+/g, replacement: ' == ' },
      { regex: /\s+ne\s+/g, replacement: ' != ' }
    ];

    rules.forEach(({ regex, replacement }) => {
      code = code.replace(regex, replacement);
    });
    
    return code;
  }
  
  return code;
}
