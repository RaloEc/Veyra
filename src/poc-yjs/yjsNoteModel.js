"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var yjsNoteModel_exports = {};
__export(yjsNoteModel_exports, {
  YjsNoteModel: () => YjsNoteModel
});
module.exports = __toCommonJS(yjsNoteModel_exports);
var Y = __toESM(require("yjs"));
class YjsNoteModel {
  doc;
  meta;
  pageOrder;
  constructor(existingDoc) {
    this.doc = existingDoc || new Y.Doc();
    this.meta = this.doc.getMap("meta");
    this.pageOrder = this.doc.getArray("pageOrder");
  }
  /**
   * Inicializa los valores por defecto si el documento está recién creado.
   */
  initializeDefaults(options = {}) {
    this.doc.transact(() => {
      if (!this.meta.has("title")) {
        this.meta.set("title", options.title || "");
      }
      if (!this.meta.has("layout")) {
        this.meta.set("layout", options.layout || "vertical");
      }
      if (!this.meta.has("fontFamily")) {
        this.meta.set("fontFamily", options.fontFamily || "sans");
      }
      if (!this.meta.has("createdAt")) {
        this.meta.set("createdAt", Date.now());
      }
      if (this.pageOrder.length === 0) {
        this.addPage();
      }
    }, "local-init");
  }
  // ─── GESTIÓN DE METADATOS ───────────────────────────────────────────────
  getTitle() {
    return this.meta.get("title") || "";
  }
  setTitle(newTitle, origin = "local") {
    this.doc.transact(() => {
      this.meta.set("title", newTitle);
      this.meta.set("updatedAt", Date.now());
    }, origin);
  }
  getLayout() {
    return this.meta.get("layout") || "vertical";
  }
  setLayout(layout, origin = "local") {
    this.doc.transact(() => {
      this.meta.set("layout", layout);
      this.meta.set("updatedAt", Date.now());
    }, origin);
  }
  getFontFamily() {
    return this.meta.get("fontFamily") || "sans";
  }
  setFontFamily(fontFamily, origin = "local") {
    this.doc.transact(() => {
      this.meta.set("fontFamily", fontFamily);
      this.meta.set("updatedAt", Date.now());
    }, origin);
  }
  getMetadata() {
    return {
      title: this.getTitle(),
      layout: this.getLayout(),
      fontFamily: this.getFontFamily(),
      updatedAt: this.meta.get("updatedAt") || Date.now()
    };
  }
  // ─── GESTIÓN DE HOJAS CON IDENTIFICADORES ESTABLES ──────────────────────
  /**
   * Retorna el listado ordenado de IDs de páginas activas.
   */
  getPageIds() {
    return this.pageOrder.toArray();
  }
  /**
   * Obtiene el XmlFragment de Tiptap asociado a una página por su ID estable.
   */
  getPageFragment(pageId) {
    return this.doc.getXmlFragment(pageId);
  }
  /**
   * Añade una nueva hoja con ID estable en una posición determinada.
   * @param targetIndex Índice donde insertar (si no se define, se añade al final)
   * @param customPageId ID personalizado opcional (por defecto genera page_<uuid>)
   * @param origin Origen de la transacción
   */
  addPage(targetIndex, customPageId, origin = "local") {
    const id = customPageId || `page_${Math.random().toString(36).substring(2, 11)}_${Date.now().toString(36)}`;
    this.doc.transact(() => {
      const index = typeof targetIndex === "number" && targetIndex >= 0 && targetIndex <= this.pageOrder.length ? targetIndex : this.pageOrder.length;
      this.pageOrder.insert(index, [id]);
      const fragment = this.doc.getXmlFragment(id);
      if (fragment.length === 0) {
        const p = new Y.XmlElement("paragraph");
        const text = new Y.XmlText();
        p.insert(0, [text]);
        fragment.insert(0, [p]);
      }
      this.meta.set("updatedAt", Date.now());
    }, origin);
    return id;
  }
  /**
   * Elimina una hoja por su ID estable.
   * Si era la única hoja, recrea una vacía para mantener la consistencia.
   */
  removePage(pageId, origin = "local") {
    let removed = false;
    this.doc.transact(() => {
      const currentIds = this.pageOrder.toArray();
      const index = currentIds.indexOf(pageId);
      if (index !== -1) {
        this.pageOrder.delete(index, 1);
        removed = true;
        if (this.pageOrder.length === 0) {
          this.addPage(0, void 0, origin);
        }
        this.meta.set("updatedAt", Date.now());
      }
    }, origin);
    return removed;
  }
  /**
   * Reordena una hoja moviéndola de un índice a otro de forma atómica.
   */
  movePage(fromIndex, toIndex, origin = "local") {
    if (fromIndex < 0 || fromIndex >= this.pageOrder.length || toIndex < 0 || toIndex >= this.pageOrder.length) {
      return false;
    }
    if (fromIndex === toIndex) return true;
    this.doc.transact(() => {
      const pageId = this.pageOrder.get(fromIndex);
      this.pageOrder.delete(fromIndex, 1);
      this.pageOrder.insert(toIndex, [pageId]);
      this.meta.set("updatedAt", Date.now());
    }, origin);
    return true;
  }
  /**
   * Retorna un resumen estructurado completo de toda la nota (AST y metadatos).
   */
  toStructuredSnapshot() {
    const metadata = this.getMetadata();
    const pageIds = this.getPageIds();
    const pages = pageIds.map((id) => {
      const fragment = this.getPageFragment(id);
      return {
        id,
        content: serializeXmlFragment(fragment)
      };
    });
    return { metadata, pages };
  }
}
function serializeXmlFragment(node) {
  if (node instanceof Y.XmlFragment) {
    return {
      type: "fragment",
      children: node.toArray().map(serializeXmlFragment)
    };
  } else if (node instanceof Y.XmlElement) {
    return {
      type: "element",
      name: node.nodeName,
      attributes: node.getAttributes(),
      children: node.toArray().map(serializeXmlFragment)
    };
  } else if (node instanceof Y.XmlText) {
    return {
      type: "text",
      content: node.toString(),
      delta: node.toDelta()
    };
  }
  return null;
}
