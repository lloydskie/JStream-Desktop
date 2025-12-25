import fs from 'fs';
import path from 'path';

type CompiledRule = { raw: string, re?: RegExp, isRegex: boolean };

class AdblockManager {
  enabled = true;
  popupBlocking = true;
  // compiled block and exception rules
  blockRules: CompiledRule[] = [];
  exceptionRules: CompiledRule[] = [];
  cosmeticSelectors: string[] = [];
  cosmeticExceptions: string[] = [];
  filtersDir: string;

  constructor() {
    // Directory containing the provided filter lists (easylist, filters.txt, etc.)
    this.filtersDir = path.join(__dirname, '..', 'adblock');
    this.reloadFilters();
  }

  reloadFilters() {
    try {
      const files = fs.readdirSync(this.filtersDir);
      let combined = '';
      for (const f of files) {
        if (!f.endsWith('.txt')) continue;
        const p = path.join(this.filtersDir, f);
        try {
          const c = fs.readFileSync(p, 'utf8');
          combined += '\n' + c;
        } catch (e) {
          // skip unreadable file
        }
      }
      this.parseFilterFile(combined);
    } catch (e) {
      console.warn('Adblock: failed to load filter directory, falling back to filters.txt', e);
      try {
        const fallback = path.join(this.filtersDir, 'filters.txt');
        const content = fs.readFileSync(fallback, 'utf8');
        this.parseFilterFile(content);
      } catch (err) {
        console.warn('Adblock: no filters available', err);
      }
    }
  }

  parseFilterFile(content: string) {
    this.blockRules = [];
    this.exceptionRules = [];
    this.cosmeticSelectors = [];
    this.cosmeticExceptions = [];

    const lines = content.split(/\r?\n/);
    for (let raw of lines) {
      raw = raw.trim();
      if (!raw) continue;
      if (raw.startsWith('!') || raw.startsWith('#')) continue; // comments

      // Cosmetic rules
      // e.g. example.com##.ad, ##.site-ad
      const cosmeticIdx = raw.indexOf('##');
      const cosmeticExceptionIdx = raw.indexOf('#@#');
      if (cosmeticIdx !== -1) {
        const sel = raw.slice(cosmeticIdx + 2).trim();
        if (sel) this.cosmeticSelectors.push(sel);
        continue;
      }
      if (cosmeticExceptionIdx !== -1) {
        const sel = raw.slice(cosmeticExceptionIdx + 3).trim();
        if (sel) this.cosmeticExceptions.push(sel);
        continue;
      }

      // Exception rule
      if (raw.startsWith('@@')) {
        const r = raw.slice(2);
        const compiled = this.compileRule(r);
        if (compiled) this.exceptionRules.push(compiled);
        continue;
      }

      // Normal block rule
      const compiled = this.compileRule(raw);
      if (compiled) this.blockRules.push(compiled);
    }
  }

  // Convert a subset of ABP rule syntax to a RegExp. This is not a full implementation
  // but covers common constructs found in EasyList and similar lists used in this repo.
  compileRule(rule: string): CompiledRule | null {
    rule = rule.trim();
    if (!rule) return null;

    // If rule is a regex /.../
    if (rule.startsWith('/') && rule.lastIndexOf('/') > 0) {
      const last = rule.lastIndexOf('/');
      const body = rule.slice(1, last);
      try {
        const re = new RegExp(body);
        return { raw: rule, re, isRegex: true };
      } catch (e) {
        return null;
      }
    }

    // Replace ABP tokens with regex equivalents
    let r = rule
      .replace(/\^/g, '(?:[^A-Za-z0-9._%\-]|$)') // separator token
      .replace(/\*/g, '.*');

    // Leading || indicates domain anchor
    if (r.startsWith('||')) {
      // example: ||domain.com^ -> match protocol and optional subdomains
      r = r.slice(2);
      // escape dots
      const esc = r.replace(/([.*+?^${}()|[\]\\])/g, '\\$1');
      // remove our separator replacement if present at end
      const body = esc.replace(/\\\(\?:\[\^A\-Za\-z0\-9\._%\\-\]\|\$\)$/, '');
      const regexStr = '^(?:https?:\\/\\/)?(?:[^\/]*\\.)?' + body;
      try {
        const re = new RegExp(regexStr);
        return { raw: rule, re, isRegex: false };
      } catch (e) { /* fallthrough */ }
    }

    // Anchors: | at start or end
    let startsAnchored = false;
    let endsAnchored = false;
    if (r.startsWith('|')) { startsAnchored = true; r = r.slice(1); }
    if (r.endsWith('|')) { endsAnchored = true; r = r.slice(0, -1); }

    // Escape characters except our .* and separator pattern
    // We'll escape remaining regex meta characters
    const escaped = r.replace(/([.+?^${}()|[\]\\])/g, '\\$1');
    let final = escaped;
    if (startsAnchored) final = '^' + final;
    if (endsAnchored) final = final + '$';

    try {
      const re = new RegExp(final);
      return { raw: rule, re, isRegex: false };
    } catch (e) {
      return null;
    }
  }

  matches(urlString: string) {
    if (!this.enabled) return false;
    try {
      const full = urlString;

      // Exceptions win first
      for (const ex of this.exceptionRules) {
        if (!ex) continue;
        if (ex.isRegex && ex.re) {
          if (ex.re.test(full)) return false;
        } else if (ex.re) {
          if (ex.re.test(full)) return false;
        }
      }

      // Then check blocks
      for (const b of this.blockRules) {
        if (!b) continue;
        if (b.isRegex && b.re) {
          if (b.re.test(full)) return true;
        } else if (b.re) {
          if (b.re.test(full)) return true;
        } else if (b.raw && full.includes(b.raw)) {
          return true;
        }
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  addRule(rule: string) {
    const c = this.compileRule(rule);
    if (c) this.blockRules.push(c);
    return this.blockRules.length;
  }

  addHostRule(host: string) {
    // Convert host to a simple contains rule
    const rule = '*://' + host + '/*';
    return this.addRule(rule);
  }

  addCosmetic(selector: string) {
    this.cosmeticSelectors.push(selector);
    return this.cosmeticSelectors.length;
  }

  updateLists(lines: string[]) {
    // Overwrite filters.txt with the provided lines and reload
    try {
      const p = path.join(this.filtersDir, 'filters.txt');
      fs.writeFileSync(p, lines.join('\n'), 'utf8');
      this.reloadFilters();
    } catch (e) {
      console.error('Adblock: failed to update filters file', e);
    }
    return { blockRules: this.blockRules.length, exceptionRules: this.exceptionRules.length, cosmeticSelectors: this.cosmeticSelectors.length };
  }

  stats() {
    return { enabled: this.enabled, blockRules: this.blockRules.length, exceptionRules: this.exceptionRules.length, cosmeticSelectors: this.cosmeticSelectors.length };
  }
}

const manager = new AdblockManager();

export default manager;
