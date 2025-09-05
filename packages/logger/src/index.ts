import { consola, createConsola } from "consola";

const MIN_LOG_LEVEL = 3;

export const logger = createConsola({
  reporters: [
    {
      log: (obj, ctx) => {
        if (ctx.options.level >= MIN_LOG_LEVEL) {
          consola.log(obj);
        }
      },
    },
  ],
});
