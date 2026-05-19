import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { extractStnStructure } from "./extract-stn-regimento.mjs";

test("extractStnStructure parses units, competencies, and hierarchy", () => {
  const html = `
    <h1>Siorg - Relatorio Dinamico - Competencias</h1>
    <table><tbody>
      <tr class="bold-row" name="ExScr1"><td>Secretaria do Tesouro Nacional</td><td>STN</td></tr>
      <tr><td colspan="2" class="full-width">I - Competencia geral;<br>II - Outra competencia.</td></tr>
      <tr class="bold-row" name="ExScr1"><td>Subsecretaria de Administracao Financeira Federal</td><td>SUAFI</td></tr>
      <tr><td colspan="2" class="full-width">I - Subsecretaria competência.</td></tr>
      <tr class="bold-row" name="ExScr1"><td>Coordenacao-Geral de Planejamento e Programacao Financeira</td><td>COFIN</td></tr>
      <tr><td colspan="2" class="full-width">I - Coordenacao geral competência.</td></tr>
      <tr class="bold-row" name="ExScr1"><td>Coordenacao de Gestao da Programacao Financeira</td><td>CSFIN</td></tr>
      <tr><td colspan="2" class="full-width">I - Coordenacao competência.</td></tr>
      <tr class="bold-row" name="ExScr1"><td>Gerencia da Programacao Financeira</td><td>GEFIN</td></tr>
      <tr><td colspan="2" class="full-width">I - Gerencia competência.<br>a) subitem da gerencia.</td></tr>
    </tbody></table>
  `;

  const extracted = extractStnStructure(html, "fixture.html");

  assert.equal(extracted.summary.totalUnidades, 5);
  assert.equal(extracted.units[0].sigla, "STN");
  assert.equal(extracted.units[1].parentSigla, "STN");
  assert.equal(extracted.units[2].parentSigla, "SUAFI");
  assert.equal(extracted.units[3].parentSigla, "COFIN");
  assert.equal(extracted.units[4].parentSigla, "CSFIN");
  assert.equal(extracted.units[4].competencias[0].code, "I");
  assert.match(extracted.units[4].competencias[0].text, /a\) subitem da gerencia\./i);
});

test("extractStnStructure processes current STN regimento file", async () => {
  const sourcePath = path.resolve(process.cwd(), "20260415 relatorio-dinamico-estrutura-viva.html");
  const html = await readFile(sourcePath, "utf8");
  const extracted = extractStnStructure(html, path.basename(sourcePath));

  assert.ok(extracted.summary.totalUnidades >= 150);
  assert.equal(extracted.units[0].sigla, "STN");
  assert.equal(extracted.units[0].type, "secretaria");
  assert.ok(extracted.summary.totalCompetencias > 500);
});
