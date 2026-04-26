/**
 * Spotify Dashboard / TV Layout for YouTube Music - Content Script
 * Final Fixes: Thumbnails, Metadata Sync, and Volume/Minimize controls.
 */

(function() {
    console.log('Spotify Dashboard for YouTube Music loaded');

    // 1. Dashboard State
    const state = {
        isDashboardOpen: false,
        lastTrackId: null
    };

    // 2. Dashboard Template (Added Volume & Minimize)
    const dashboardHTML = `
        <div id="spotify-canvas-bg"></div>
        <div id="spotify-canvas-overlay"></div>
        <div id="spotify-dashboard">
            <div class="dashboard-top">
                <div class="dashboard-context-container">
                    <div class="dashboard-context">Playing from playlist</div>
                    <div class="dashboard-playlist-name">...</div>
                </div>
                <div class="dashboard-upnext" id="dashboard-upnext">
                    <div class="dashboard-upnext-thumb" id="upnext-thumb"></div>
                    <div class="dashboard-upnext-info">
                        <div class="dashboard-upnext-label">Up Next</div>
                        <div class="dashboard-upnext-title" id="upnext-title">...</div>
                    </div>
                </div>
            </div>
            <div class="dashboard-middle">
                <div class="dashboard-main-thumb" id="main-thumb"></div>
                <div class="dashboard-track-info">
                    <h1 class="dashboard-title">...</h1>
                    <div class="dashboard-artist">...</div>
                </div>
            </div>
            <div class="dashboard-bottom">
                <div class="dashboard-timeline-container">
                    <div class="dashboard-time" id="time-current">0:00</div>
                    <div class="dashboard-progress-bar" id="progress-container">
                        <div class="dashboard-progress-fill" id="progress-fill"></div>
                    </div>
                    <div class="dashboard-time" id="time-total">0:00</div>
                </div>
                <div class="dashboard-controls-row">
                    <div class="dashboard-left-placeholder"></div>
                    <div class="dashboard-controls">
                        <button class="dashboard-control-btn" id="ctrl-prev">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
                        </button>
                        <button class="dashboard-control-btn dashboard-play-pause" id="ctrl-play-pause">
                            <svg id="play-icon" width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                            <svg id="pause-icon" width="32" height="32" viewBox="0 0 24 24" fill="currentColor" style="display:none"><path d="M6 19h4V5H6v14zm8-14v14h4V5h4z"/></svg>
                        </button>
                        <button class="dashboard-control-btn" id="ctrl-next">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
                        </button>
                    </div>
                    <div class="dashboard-bottom-right">
                        <div class="dashboard-volume-container" id="volume-container">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" class="volume-icon"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
                            <div class="dashboard-volume-bar">
                                <div class="dashboard-volume-fill" id="volume-fill"></div>
                            </div>
                        </div>
                        <button class="dashboard-control-btn" id="ctrl-minimize" title="Exit Dashboard">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/></svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // 3. Initialization
    function init() {
        if (!document.getElementById('spotify-dashboard')) {
            const container = document.createElement('div');
            container.innerHTML = dashboardHTML;
            document.body.prepend(...container.childNodes);
            setupEventListeners();
        }
    }

    function setupEventListeners() {
        document.getElementById('ctrl-prev')?.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelector('#previous-button')?.click();
        });
        document.getElementById('ctrl-next')?.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelector('#next-button')?.click();
        });
        document.getElementById('ctrl-play-pause')?.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelector('#play-pause-button')?.click();
        });
        document.getElementById('ctrl-minimize')?.addEventListener('click', (e) => {
            e.stopPropagation();
            // Exit fullscreen if possible, otherwise just hide the player page
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                // Click YTM's native minimize button
                document.querySelector('tp-yt-paper-icon-button.ytmusic-player-page')?.click();
            }
        });

        // Seek functionality
        document.getElementById('progress-container')?.addEventListener('click', (e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            const progressBar = document.querySelector('#progress-bar.ytmusic-player-bar');
            if (progressBar) {
                progressBar.value = percent * progressBar.max;
                progressBar.dispatchEvent(new Event('change'));
            }
        });

        // Volume functionality
        document.getElementById('volume-container')?.addEventListener('click', (e) => {
            const rect = e.currentTarget.querySelector('.dashboard-volume-bar').getBoundingClientRect();
            let percent = (e.clientX - rect.left) / rect.width;
            percent = Math.max(0, Math.min(1, percent));
            const volumeSlider = document.querySelector('#volume-slider');
            if (volumeSlider) {
                volumeSlider.value = percent * 100;
                volumeSlider.dispatchEvent(new Event('change'));
            }
        });
    }

    // 4. State Update Logic
    function updateState() {
        const isPlayerOpen = !!document.querySelector('ytmusic-player-page[player-page-open]');
        const isFullscreen = !!document.fullscreenElement;
        const shouldShowDashboard = isPlayerOpen && isFullscreen;

        if (state.isDashboardOpen !== shouldShowDashboard) {
            state.isDashboardOpen = shouldShowDashboard;
            if (shouldShowDashboard) {
                document.body.setAttribute('dashboard-open', '');
            } else {
                document.body.removeAttribute('dashboard-open');
            }
        }

        if (!shouldShowDashboard) {
            document.getElementById('spotify-canvas-bg').style.opacity = '0';
            document.getElementById('spotify-canvas-overlay').style.opacity = '0';
            return;
        }

        document.getElementById('spotify-canvas-bg').style.opacity = '1';
        document.getElementById('spotify-canvas-overlay').style.opacity = '1';

        // 1. IMPROVED THUMBNAIL EXTRACTION
        // We look for the main high-res image first
        const mainImg = document.querySelector('ytmusic-player-page #song-image img') ||
                        document.querySelector('ytmusic-player-bar #song-image img');
        
        const thumb = mainImg?.src || '';
        if (thumb && !thumb.includes('data:image')) {
            const highResThumb = thumb.replace(/=w\d+-h\d+/, '=w1200-h1200');
            
            // Apply to main square and background
            const mainSquare = document.getElementById('main-thumb');
            const bg = document.getElementById('spotify-canvas-bg');
            
            if (mainSquare) {
                mainSquare.style.backgroundImage = `url("${highResThumb}")`;
                mainSquare.style.backgroundSize = 'cover';
                mainSquare.style.backgroundPosition = 'center';
            }
            if (bg) bg.style.backgroundImage = `url("${highResThumb}")`;
        }

        // 2. METADATA SYNC (Title/Artist)
        const title = document.querySelector('ytmusic-player-bar .title')?.innerText || '...';
        const artist = document.querySelector('ytmusic-player-bar .byline')?.innerText || '...';
        document.querySelector('.dashboard-title').innerText = title;
        document.querySelector('.dashboard-artist').innerText = artist;

        // 3. PROGRESS SYNC
        const progressBar = document.querySelector('#progress-bar.ytmusic-player-bar');
        if (progressBar) {
            const progress = (progressBar.value / progressBar.max) * 100;
            document.getElementById('progress-fill').style.width = `${progress}%`;
            
            const timeInfo = document.querySelector('.time-info.ytmusic-player-bar')?.innerText || '0:00 / 0:00';
            const [current, total] = timeInfo.split(' / ');
            document.getElementById('time-current').innerText = current || '0:00';
            document.getElementById('time-total').innerText = total || '0:00';
        }

        // 4. PLAY/PAUSE STATE
        const isPlaying = document.querySelector('#play-pause-button')?.getAttribute('aria-label') === 'Pause';
        document.getElementById('play-icon').style.display = isPlaying ? 'none' : 'block';
        document.getElementById('pause-icon').style.display = isPlaying ? 'block' : 'none';

        // 5. IMPROVED UP NEXT EXTRACTION
        // Instead of strict sibling matching, we find the "Selected" item and look for the next one
        const queueItems = Array.from(document.querySelectorAll('ytmusic-player-queue-item'));
        const selectedIndex = queueItems.findIndex(item => item.hasAttribute('selected'));
        const upNextItem = queueItems[selectedIndex + 1];

        if (upNextItem) {
            const nextTitle = upNextItem.querySelector('.song-title')?.innerText || 
                              upNextItem.querySelector('.title')?.innerText || '...';
            const nextThumb = upNextItem.querySelector('img')?.src || 
                              upNextItem.querySelector('yt-img-shadow img')?.src || '';
            document.getElementById('upnext-title').innerText = nextTitle;
            document.getElementById('upnext-thumb').style.backgroundImage = `url(${nextThumb})`;
            document.getElementById('dashboard-upnext').style.display = 'flex';
        } else {
            // Check if queue is visible in sidebar for more robust scraping
            const sidebarNext = document.querySelector('ytmusic-player-queue-item[playing] + ytmusic-player-queue-item');
            if (sidebarNext) {
                 const nextTitle = sidebarNext.querySelector('.song-title')?.innerText || '...';
                 const nextThumb = sidebarNext.querySelector('img')?.src || '';
                 document.getElementById('upnext-title').innerText = nextTitle;
                 document.getElementById('upnext-thumb').style.backgroundImage = `url(${nextThumb})`;
                 document.getElementById('dashboard-upnext').style.display = 'flex';
            } else {
                document.getElementById('dashboard-upnext').style.display = 'none';
            }
        }

        // 6. PLAYLIST CONTEXT
        const playlistName = document.querySelector('ytmusic-player-page .title.ytmusic-metadata-renderer')?.innerText 
                          || document.querySelector('ytmusic-player-queue #header .title')?.innerText
                          || 'Your Library';
        document.querySelector('.dashboard-playlist-name').innerText = playlistName;

        // 7. VOLUME SYNC
        const volumeSlider = document.querySelector('#volume-slider');
        if (volumeSlider) {
            const volumeVal = volumeSlider.value;
            document.getElementById('volume-fill').style.width = `${volumeVal}%`;
        }
    }

    // 5. Pulse Update
    init();
    setInterval(updateState, 500);

    // Font injection
    if (!document.getElementById('spotify-font-link')) {
        const link = document.createElement('link');
        link.id = 'spotify-font-link';
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap';
        document.head.appendChild(link);
    }

})();
