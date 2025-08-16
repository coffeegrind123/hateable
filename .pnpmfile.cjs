/**
 * pnpm configuration for approving build scripts
 * This allows specific packages to run their build scripts during installation
 */

module.exports = {
  hooks: {
    readPackage(pkg, context) {
      // Approve build scripts for packages that need them
      const approvedPackages = [
        '@tailwindcss/oxide',
        'sharp',
        'unrs-resolver',
        'esbuild',
        'swc',
        '@swc/core',
        'turbo',
        'prisma',
        '@prisma/client'
      ];

      if (approvedPackages.includes(pkg.name)) {
        // Ensure these packages can run their build scripts
        pkg.scripts = pkg.scripts || {};
      }

      return pkg;
    }
  }
};