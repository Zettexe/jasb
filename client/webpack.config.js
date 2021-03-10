/* eslint-disable */

const path = require("path");
const sass = require("sass");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const FaviconsWebpackPlugin = require("favicons-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const CompressionPlugin = require("compression-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

const src = path.join(__dirname, "src");
const assets = path.join(__dirname, "assets");
const dist = path.join(__dirname, "dist");

module.exports = (env, argv) => {
  const mode =
    argv !== undefined && argv.mode !== undefined
      ? argv.mode
      : process.env["WEBPACK_MODE"] !== undefined
      ? process.env["WEBPACK_MODE"]
      : "production";

  const production = mode === "production";

  return {
    mode: mode,
    context: __dirname,
    entry: {
      jasb: path.join(src, "ts", "index.ts"),
    },
    resolve: {
      extensions: [".ts", ".elm", ".js", ".scss", ".css"],
      modules: ["node_modules"],
    },
    module: {
      rules: [
        {
          test: /\.(svg|png)$/,
          loader: "file-loader",
          options: {
            name: "assets/images/[name].[hash].[ext]",
            esModule: false,
          },
        },
        {
          test: /\.[tj]s$/,
          exclude: [/elm-stuff/, /node_modules/],
          use: ["ts-loader"],
        },
        {
          test: /\.s?css$/,
          exclude: [/elm-stuff/, /node_modules/],
          use: [
            ...(production
              ? [
                  {
                    loader: MiniCssExtractPlugin.loader,
                  },
                ]
              : [{ loader: "style-loader" }]),
            {
              loader: "css-loader",
              options: { importLoaders: 3, sourceMap: !production },
            },
            {
              loader: "postcss-loader",
              options: {
                sourceMap: !production,
              },
            },
            {
              loader: "resolve-url-loader",
              options: { sourceMap: !production },
            },
            {
              loader: "sass-loader",
              options: {
                implementation: sass,
                sourceMap: !production,
                sassOptions: {
                  includePaths: ["node_modules"],
                },
              },
            },
          ],
        },
        {
          test: /\.elm$/,
          exclude: [/elm-stuff/, /node_modules/],
          use: [
            ...(production ? ["elm-hot-webpack-loader"] : []),
            {
              loader: "elm-webpack-loader",
              options: {
                optimize: production,
                debug: !production,
                forceWatch: !production,
              },
            },
          ],
        },
      ],
    },
    output: {
      path: dist,
      publicPath: "/",
      filename: "assets/scripts/[name].[contenthash].js",
    },
    plugins: [
      new CleanWebpackPlugin(),
      new MiniCssExtractPlugin({
        filename: "assets/styles/[name].[contenthash].css",
      }),
      new HtmlWebpackPlugin({
        template: "src/html/index.html",
        filename: "index.html",
        inject: "body",
        test: /\.html$/,
      }),
      new FaviconsWebpackPlugin({
        logo: path.join(assets, "images", "monocoin.png"),
        prefix: "assets/images/",
        favicons: {
          lang: "en",
          start_url: "/",
          icons: {
            android: false,
            appleIcon: false,
            appleStartup: false,
            coast: false,
            favicons: true,
            firefox: false,
            windows: false,
            yandex: false,
          },
        },
      }),
      // ...(production
      //   ? [
      //       new CompressionPlugin({
      //         test: /\.(js|css|html|webmanifest|svg)$/,
      //         minRatio: 0.95,
      //         filename: "[path][base]",
      //         deleteOriginalAssets: true,
      //       }),
      //     ]
      //   : []),
    ],
    optimization: {
      minimizer: [
        new TerserPlugin({
          test: /assets\/scripts\/.*\.js$/,
          parallel: true,
          terserOptions: {
            output: {
              comments: false,
            },
          },
        }),
      ],
    },
    devtool: !production ? "eval-source-map" : undefined,
    devServer: {
      contentBase: dist,
      hot: true,
      //host: "0.0.0.0",
      allowedHosts: ["localhost"],
      proxy: {
        // As we are an SPA, this lets us route all requests to the index.
        "**": {
          target: "http://localhost:8080",
          pathRewrite: {
            ".*": "",
          },
        },
      },
    },
  };
};
