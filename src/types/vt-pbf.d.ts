// vt-pbf は DefinitelyTyped に未登録。最低限必要な形だけ宣言する。
declare module "vt-pbf" {
  interface VtLayerLike {
    length: number;
    name?: string;
    version?: number;
    extent?: number;
    feature(i: number): {
      id?: number | undefined;
      type: number;
      properties: Record<string, unknown>;
      loadGeometry(): Array<Array<{ x: number; y: number }>>;
    };
  }

  interface VtTileLike {
    layers: Record<string, VtLayerLike>;
  }

  function fromVectorTileJs(tile: VtTileLike): Uint8Array;

  const _default: typeof fromVectorTileJs & {
    fromVectorTileJs: typeof fromVectorTileJs;
  };
  export default _default;
}
