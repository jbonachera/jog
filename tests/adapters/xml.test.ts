import { describe, expect, it } from 'vitest';
import { ErreurXml, lireXml, texteDe } from '../../src/adapters/xml/lecteur';

describe('lecteur XML (sans DOMParser, utilisable dans le Worker)', () => {
  it('décode les cinq entités prédéfinies dans les attributs et dans le texte', () => {
    const racine = lireXml('<a titre="A &amp; B &lt;c&gt; &quot;d&quot; &apos;e&apos;">x &amp;amp; &lt;y&gt;</a>');

    expect(racine.attributs.titre).toBe('A & B <c> "d" \'e\'');
    expect(racine.texte).toBe('x &amp; <y>');
  });

  it('accepte les attributs entre guillemets doubles et simples', () => {
    const racine = lireXml(`<a un="1" deux='2' trois = "3"/>`);

    expect(racine.attributs).toEqual({ un: '1', deux: '2', trois: '3' });
  });

  it('lit une section CDATA comme du texte brut, sans décoder les entités', () => {
    const racine = lireXml('<a><![CDATA[1 < 2 &amp; <b>]]></a>');

    expect(racine.texte).toBe('1 < 2 &amp; <b>');
    expect(racine.enfants).toHaveLength(0);
  });

  it('ignore les commentaires, y compris ceux qui contiennent des balises', () => {
    const racine = lireXml('<a><!-- <b>caché</b> -->texte</a>');

    expect(racine.enfants).toHaveLength(0);
    expect(racine.texte).toBe('texte');
  });

  it('ignore la déclaration XML et la doctype', () => {
    const racine = lireXml('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE a>\n<a><b/></a>');

    expect(racine.nom).toBe('a');
    expect(racine.enfants.map((e) => e.nom)).toEqual(['b']);
  });

  it('reconnaît les éléments auto-fermants, seuls ou imbriqués', () => {
    const racine = lireXml('<a><b x="1"/><c/></a>');

    expect(racine.enfants.map((e) => e.nom)).toEqual(['b', 'c']);
    expect(racine.enfants[0]?.attributs.x).toBe('1');
    expect(racine.enfants[1]?.enfants).toHaveLength(0);
  });

  it('garde le préfixe d’espace de noms dans le nom de l’élément', () => {
    const racine = lireXml('<gpxtpx:hr xmlns:gpxtpx="x">152</gpxtpx:hr>');

    expect(racine.nom).toBe('gpxtpx:hr');
    expect(racine.texte).toBe('152');
  });

  it('signale explicitement un document tronqué', () => {
    expect(() => lireXml('<trk><trkseg><trkpt time="2026">')).toThrow(ErreurXml);
    expect(() => lireXml('<trk><trkseg><trkpt time="2026">')).toThrow(/tronqué/);
  });

  it('signale une balise fermante qui ne correspond à aucune ouverture', () => {
    expect(() => lireXml('<a><b></a>')).toThrow(ErreurXml);
  });

  it('signale un document vide', () => {
    expect(() => lireXml('   ')).toThrow(ErreurXml);
  });

  it('décode les entités numériques décimales et hexadécimales', () => {
    const racine = lireXml('<a x="&#65;&#x42;">&#67;&#x44;&#x1F600;</a>');

    expect(racine.attributs.x).toBe('AB');
    expect(racine.texte).toBe('CD\u{1F600}');
  });

  it('refuse un document à deux éléments racine', () => {
    expect(() => lireXml('<a/><b/>')).toThrow(ErreurXml);
    expect(() => lireXml('<a/><b/>')).toThrow(/plusieurs éléments racine/);
  });

  it('refuse une balise fermante qui ne correspond pas à l’ouvrante', () => {
    expect(() => lireXml('<a></b>')).toThrow(ErreurXml);
  });

  it('supprime les espaces de bord du texte d’un élément', () => {
    expect(texteDe(lireXml('<a>\n  12 \t</a>'))).toBe('12');
    expect(texteDe(undefined)).toBe('');
  });

  it('conserve une entité inconnue telle quelle, sans la décoder', () => {
    expect(lireXml('<a>&nbsp;&foo;</a>').texte).toBe('&nbsp;&foo;');
  });

  it('ignore la doctype et n’y développe pas les entités (billion laughs)', () => {
    const racine = lireXml('<!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;">]><lolz>&lol2;</lolz>');

    expect(racine.nom).toBe('lolz');
    expect(racine.texte).toBe('&lol2;');
  });

  it('ignore une doctype dont une valeur d’entité contient un chevron', () => {
    const racine = lireXml('<!DOCTYPE a [<!ENTITY x "<b>">]><a>&x;<c/></a>');

    expect(racine.enfants.map((e) => e.nom)).toEqual(['c']);
    expect(racine.texte).toBe('&x;');
  });

  it('refuse une référence de caractère hors Unicode, nulle ou interdite en XML', () => {
    expect(() => lireXml('<a>&#99999999;</a>')).toThrow(ErreurXml);
    expect(() => lireXml('<a>&#xD800;</a>')).toThrow(ErreurXml);
    expect(() => lireXml('<a>&#0;</a>')).toThrow(ErreurXml);
  });

  it('refuse un attribut donné deux fois', () => {
    expect(() => lireXml('<a x="1" x="2"/>')).toThrow(ErreurXml);
  });
});
