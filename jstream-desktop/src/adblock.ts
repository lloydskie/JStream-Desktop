import fs from 'fs';
import path from 'path';

type Rule = string;

class AdblockManager {
  enabled = true;
  popupBlocking = true;
  urlRules: Rule[] = [];
  hostRules: Rule[] = [];
  cosmeticSelectors: string[] = [];
  filtersPath: string;

  constructor() {
    // Resolve filters path relative to the compiled location. This works in dev and packaged apps.
    this.filtersPath = path.join(__dirname, '..', 'adblock', 'filters.txt');
    this.reloadFilters();
  }

  reloadFilters() {
    try {
      const content = fs.readFileSync(this.filtersPath, 'utf8');
      this.parseFilterFile(content);
    } catch (e) {
      // No filters file available — keep defaults
      console.warn('Adblock: failed to load filters, using defaults', e);
    }
  }

  parseFilterFile(content: string) {
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const urlRules: Rule[] = [];
    const hostRules: Rule[] = [];
    for (const l of lines) {
      if (l.startsWith('#') || l.startsWith('/*')) continue;
      // crude heuristic: if line contains "/" or "*" treat as url rule, else host
      if (l.includes('/') || l.includes('*')) urlRules.push(l);
      else if (l.includes('.') || l.includes('ad')) hostRules.push(l);
      else hostRules.push(l);
    }
    this.urlRules = urlRules;
    this.hostRules = hostRules;
  }

  matches(urlString: string) {
    try {
      const u = new URL(urlString);
      const host = u.hostname;
      const full = urlString;
      // Host rules: simple substring match
      for (const h of this.hostRules) {
        if (!h) continue;
        if (host === h) return true;
        if (host.endsWith('.' + h)) return true;
        if (host.includes(h)) return true;
      }
      // URL rules: substring or simple wildcard
      for (const r of this.urlRules) {
        if (!r) continue;
        const pattern = r.replace(/\*/g, '');
        if (pattern && full.includes(pattern)) return true;
        try {
          const re = new RegExp(r);
          if (re.test(full)) return true;
        } catch (e) {
          // ignore invalid regex
        }
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  addRule(rule: string) {
    // Add to URL rules for simplicity
    this.urlRules.push(rule);
    return this.urlRules.length;
  }

  addHostRule(host: string) {
    this.hostRules.push(host);
    return this.hostRules.length;
  }

  addCosmetic(selector: string) {
    this.cosmeticSelectors.push(selector);
    return this.cosmeticSelectors.length;
  }

  updateLists(lines: string[]) {
    const content = lines.join('\n');
    try {
      fs.writeFileSync(this.filtersPath, content, 'utf8');
      this.parseFilterFile(content);
    } catch (e) {
      console.error('Adblock: failed to update filters file', e);
    }
    return { urlRules: this.urlRules.length, hostRules: this.hostRules.length, cosmeticSelectors: this.cosmeticSelectors.length };
  }

  stats() {
    return { enabled: this.enabled, urlRules: this.urlRules.length, cosmeticSelectors: this.cosmeticSelectors.length, hostRules: this.hostRules.length };
  }
}

const manager = new AdblockManager();

export default manager;
