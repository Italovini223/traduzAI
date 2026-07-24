/**
 * TEMPLATE VERSION
 *
 * Atualize este valor sempre que o template for evoluído (junto com o CHANGELOG.md).
 * Este número é exibido no painel admin e permite comparar com a versão mais recente
 * do template no GitHub para indicar se o app precisa de atualização.
 *
 * Formato: semver (MAJOR.MINOR.PATCH)
 *   - MAJOR: mudanças incompatíveis (migrations, breaking changes)
 *   - MINOR: novas funcionalidades (novos módulos, rotas, features)
 *   - PATCH: bug fixes e melhorias menores
 */
const TEMPLATE_VERSION = '1.9.5';

/**
 * Repositório oficial do template no GitHub.
 * Usado pelo admin panel para verificar se há versão mais recente disponível.
 */
const TEMPLATE_REPO = 'NuvemproApp/nuvempro-app-template';

module.exports = { TEMPLATE_VERSION, TEMPLATE_REPO };
