declare var addon: import("../src/addon").default;
declare var ztoolkit: ZToolkit;
declare var _globalThis: typeof globalThis & {
  addon: import("../src/addon").default;
  ztoolkit: ZToolkit;
};

declare const __env__: "development" | "production";

type ZToolkit = ReturnType<
  typeof import("../src/utils/ztoolkit").createZToolkit
>;
