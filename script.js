        // 检测网站状态
        function checkWebsiteStatus() {
            const statusLight = document.getElementById('status-light');
            const statusText = document.getElementById('status-text');
            
            // 初始状态为检测中
            statusLight.className = 'status-light gray';
            statusText.textContent = '代理服务状态检测中，请稍候...';
            
            // 使用fetch API检测网站状态
            fetch('https://wikipedia.zyhorg.ac.cn/static/images/project-logos/zhwiki.png?t=' + new Date().getTime(), {
                method: 'HEAD',
                mode: 'no-cors',
                cache: 'no-store'
            })
            .then(() => {
                // 请求成功，服务正常
                statusLight.className = 'status-light green pulse-animation';
                statusText.textContent = '代理服务状态正常 ';
            })
            .catch(() => {
                // 请求失败，服务不稳定
                statusLight.className = 'status-light yellow';
                statusText.textContent = '代理服务不稳定 {{{(>_<)}}}';
            });
        }
        
        // 页面加载时立即检测一次
        checkWebsiteStatus();
        
        // 然后每10秒检测一次
        setInterval(checkWebsiteStatus, 10000);
        
        // 添加一些科技感的交互效果
        document.querySelectorAll('.tech-button, .tech-border').forEach(element => {
            element.addEventListener('mouseenter', () => {
                element.classList.add('shadow-lg');
            });
            
            element.addEventListener('mouseleave', () => {
                element.classList.remove('shadow-lg');
            });
        });
