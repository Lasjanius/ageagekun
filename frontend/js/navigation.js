/**
 * ナビゲーションメニュー管理モジュール
 */
(function() {
    'use strict';

    // DOM要素の取得
    let hamburgerBtn;
    let sidebar;
    let sidebarOverlay;
    let sidebarClose;

    /**
     * サイドバーを開く
     */
    function openSidebar() {
        if (!sidebar || !sidebarOverlay || !hamburgerBtn) return;

        sidebar.classList.add('sidebar--open');
        sidebarOverlay.classList.add('sidebar-overlay--active');
        hamburgerBtn.classList.add('hamburger--active');
        document.body.style.overflow = 'hidden'; // スクロールを無効化
    }

    /**
     * サイドバーを閉じる
     */
    function closeSidebar() {
        if (!sidebar || !sidebarOverlay || !hamburgerBtn) return;

        sidebar.classList.remove('sidebar--open');
        sidebarOverlay.classList.remove('sidebar-overlay--active');
        hamburgerBtn.classList.remove('hamburger--active');
        document.body.style.overflow = ''; // スクロールを有効化
    }

    /**
     * サイドバーのトグル
     */
    function toggleSidebar() {
        if (!sidebar) return;

        if (sidebar.classList.contains('sidebar--open')) {
            closeSidebar();
        } else {
            openSidebar();
        }
    }

    /**
     * 現在のページをハイライト
     */
    function highlightCurrentPage() {
        const currentPath = window.location.pathname;
        const sidebarLinks = document.querySelectorAll('.sidebar__link');

        sidebarLinks.forEach(link => {
            link.classList.remove('sidebar__link--active');

            const linkPath = new URL(link.href, window.location.origin).pathname;
            if (currentPath === linkPath ||
                (currentPath.endsWith('/') && linkPath.endsWith('index.html')) ||
                (currentPath.endsWith('/index.html') && linkPath.endsWith('index.html')) ||
                (currentPath.endsWith('/ai_report.html') && linkPath.endsWith('ai_report.html'))) {
                link.classList.add('sidebar__link--active');
            }
        });
    }

    /**
     * エスケープキーでサイドバーを閉じる
     */
    function handleEscapeKey(e) {
        if (e.key === 'Escape' && sidebar && sidebar.classList.contains('sidebar--open')) {
            closeSidebar();
        }
    }

    /**
     * ウィンドウリサイズ時の処理
     */
    function handleResize() {
        // タブレット以上のサイズでサイドバーが開いている場合は閉じる
        if (window.innerWidth > 1024 && sidebar && sidebar.classList.contains('sidebar--open')) {
            closeSidebar();
        }
    }

    /**
     * 初期化
     */
    function init() {
        // DOM要素の取得
        hamburgerBtn = document.getElementById('hamburgerBtn');
        sidebar = document.getElementById('sidebar');
        sidebarOverlay = document.getElementById('sidebarOverlay');
        sidebarClose = document.getElementById('sidebarClose');

        // 要素が存在しない場合は処理を終了
        if (!hamburgerBtn || !sidebar || !sidebarOverlay) {
            console.warn('Navigation elements not found');
            return;
        }

        // イベントリスナーの設定
        hamburgerBtn.addEventListener('click', toggleSidebar);

        if (sidebarClose) {
            sidebarClose.addEventListener('click', closeSidebar);
        }

        sidebarOverlay.addEventListener('click', closeSidebar);

        // サイドバー内のリンククリック時の処理
        const sidebarLinks = document.querySelectorAll('.sidebar__link');
        sidebarLinks.forEach(link => {
            link.addEventListener('click', function(e) {
                // 同じページへのリンクでない場合はサイドバーを閉じる
                const currentPath = window.location.pathname;
                const linkPath = new URL(link.href, window.location.origin).pathname;

                if (currentPath !== linkPath) {
                    closeSidebar();
                }
            });
        });

        // 現在のページをハイライト
        highlightCurrentPage();

        // キーボードイベント
        document.addEventListener('keydown', handleEscapeKey);

        // ウィンドウリサイズイベント
        window.addEventListener('resize', handleResize);

        // ページ遷移時にもハイライトを更新
        window.addEventListener('popstate', highlightCurrentPage);
    }

    // DOMContentLoadedイベントで初期化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // グローバルスコープに公開（必要に応じて）
    window.navigationMenu = {
        open: openSidebar,
        close: closeSidebar,
        toggle: toggleSidebar
    };
})();