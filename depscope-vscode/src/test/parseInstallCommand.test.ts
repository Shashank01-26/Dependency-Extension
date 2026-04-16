/**
 * Unit tests for parseInstallCommand and its helpers.
 *
 * Run with:  npx jest src/test/parseInstallCommand.test.ts
 */

import {
    parseInstallCommand,
    stripVersion,
    firstNonFlag,
    ParsedInstallCommand,
} from '../parseInstallCommand';

// ── stripVersion ─────────────────────────────────────────────────────────────

describe('stripVersion', () => {
    it('leaves a bare name unchanged', () => {
        expect(stripVersion('lodash')).toBe('lodash');
    });

    it('strips version from a plain package', () => {
        expect(stripVersion('lodash@4.17.21')).toBe('lodash');
    });

    it('strips version from a scoped package', () => {
        expect(stripVersion('@types/node@20.0.0')).toBe('@types/node');
    });

    it('leaves a scoped package without version unchanged', () => {
        expect(stripVersion('@scope/pkg')).toBe('@scope/pkg');
    });

    it('handles @latest tag', () => {
        expect(stripVersion('express@latest')).toBe('express');
    });
});

// ── firstNonFlag ─────────────────────────────────────────────────────────────

describe('firstNonFlag', () => {
    it('returns the first non-flag token', () => {
        expect(firstNonFlag(['--save-dev', 'lodash'])).toBe('lodash');
    });

    it('returns the only non-flag token', () => {
        expect(firstNonFlag(['lodash'])).toBe('lodash');
    });

    it('returns undefined when only flags are present', () => {
        expect(firstNonFlag(['-D', '--save'])).toBeUndefined();
    });

    it('returns undefined for empty array', () => {
        expect(firstNonFlag([])).toBeUndefined();
    });
});

// ── parseInstallCommand ───────────────────────────────────────────────────────

describe('parseInstallCommand', () => {

    // ── npm ──────────────────────────────────────────────────────────────────

    describe('npm', () => {
        it('parses npm install <pkg>', () => {
            expect(parseInstallCommand('npm install lodash'))
                .toEqual<ParsedInstallCommand>({ packageName: 'lodash', ecosystem: 'npm' });
        });

        it('parses npm i <pkg> (shorthand)', () => {
            expect(parseInstallCommand('npm i express'))
                .toEqual<ParsedInstallCommand>({ packageName: 'express', ecosystem: 'npm' });
        });

        it('parses npm add <pkg>', () => {
            expect(parseInstallCommand('npm add zod'))
                .toEqual<ParsedInstallCommand>({ packageName: 'zod', ecosystem: 'npm' });
        });

        it('strips version specifier', () => {
            expect(parseInstallCommand('npm install lodash@4.17.21'))
                .toEqual<ParsedInstallCommand>({ packageName: 'lodash', ecosystem: 'npm' });
        });

        it('handles scoped package', () => {
            expect(parseInstallCommand('npm install @types/node'))
                .toEqual<ParsedInstallCommand>({ packageName: '@types/node', ecosystem: 'npm' });
        });

        it('handles scoped package with version', () => {
            expect(parseInstallCommand('npm install @types/react@18.0.0'))
                .toEqual<ParsedInstallCommand>({ packageName: '@types/react', ecosystem: 'npm' });
        });

        it('skips flags before package name', () => {
            expect(parseInstallCommand('npm install --save-dev typescript'))
                .toEqual<ParsedInstallCommand>({ packageName: 'typescript', ecosystem: 'npm' });
        });

        it('returns null for bare npm install (no package)', () => {
            expect(parseInstallCommand('npm install')).toBeNull();
        });

        it('returns null for npm ci', () => {
            expect(parseInstallCommand('npm ci')).toBeNull();
        });

        it('returns null for npm run', () => {
            expect(parseInstallCommand('npm run build')).toBeNull();
        });

        it('returns null for a short command', () => {
            expect(parseInstallCommand('npm')).toBeNull();
        });
    });

    // ── yarn ─────────────────────────────────────────────────────────────────

    describe('yarn', () => {
        it('parses yarn add <pkg>', () => {
            expect(parseInstallCommand('yarn add react'))
                .toEqual<ParsedInstallCommand>({ packageName: 'react', ecosystem: 'npm' });
        });

        it('handles scoped package', () => {
            expect(parseInstallCommand('yarn add @emotion/react'))
                .toEqual<ParsedInstallCommand>({ packageName: '@emotion/react', ecosystem: 'npm' });
        });

        it('returns null for yarn install (no package)', () => {
            expect(parseInstallCommand('yarn install')).toBeNull();
        });

        it('returns null for yarn run', () => {
            expect(parseInstallCommand('yarn run test')).toBeNull();
        });
    });

    // ── pnpm ─────────────────────────────────────────────────────────────────

    describe('pnpm', () => {
        it('parses pnpm add <pkg>', () => {
            expect(parseInstallCommand('pnpm add axios'))
                .toEqual<ParsedInstallCommand>({ packageName: 'axios', ecosystem: 'npm' });
        });

        it('parses pnpm install <pkg>', () => {
            expect(parseInstallCommand('pnpm install dayjs'))
                .toEqual<ParsedInstallCommand>({ packageName: 'dayjs', ecosystem: 'npm' });
        });

        it('parses pnpm i <pkg>', () => {
            expect(parseInstallCommand('pnpm i uuid'))
                .toEqual<ParsedInstallCommand>({ packageName: 'uuid', ecosystem: 'npm' });
        });

        it('returns null for bare pnpm install', () => {
            expect(parseInstallCommand('pnpm install')).toBeNull();
        });
    });

    // ── flutter ───────────────────────────────────────────────────────────────

    describe('flutter', () => {
        it('parses flutter pub add <pkg>', () => {
            expect(parseInstallCommand('flutter pub add dio'))
                .toEqual<ParsedInstallCommand>({ packageName: 'dio', ecosystem: 'flutter' });
        });

        it('skips flags before package name', () => {
            expect(parseInstallCommand('flutter pub add --dev build_runner'))
                .toEqual<ParsedInstallCommand>({ packageName: 'build_runner', ecosystem: 'flutter' });
        });

        it('returns null for flutter pub get (no package)', () => {
            expect(parseInstallCommand('flutter pub get')).toBeNull();
        });

        it('returns null for flutter run', () => {
            expect(parseInstallCommand('flutter run')).toBeNull();
        });

        it('returns null for flutter pub add with no package', () => {
            expect(parseInstallCommand('flutter pub add')).toBeNull();
        });
    });

    // ── edge cases ────────────────────────────────────────────────────────────

    describe('edge cases', () => {
        it('returns null for empty string', () => {
            expect(parseInstallCommand('')).toBeNull();
        });

        it('returns null for unrecognised tool', () => {
            expect(parseInstallCommand('pip install requests')).toBeNull();
        });

        it('handles extra whitespace', () => {
            expect(parseInstallCommand('  npm   install   lodash  '))
                .toEqual<ParsedInstallCommand>({ packageName: 'lodash', ecosystem: 'npm' });
        });
    });
});
