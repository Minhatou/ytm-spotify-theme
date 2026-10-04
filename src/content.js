/**
 * Spotify Dashboard / TV Layout for YouTube Music - Content Script
 * Final Fixes: Thumbnails, Metadata Sync, and Volume/Minimize controls.
 */

(function() {
    console.log('Spotify Dashboard for YouTube Music loaded');

    function formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    // 1. Dashboard State
    const state = {
        isDashboardOpen: false,
        lastTrackId: null,
        isDraggingProgress: false,
        isDraggingVolume: false
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
            const btn = document.querySelector('.previous-button') || 
                        document.querySelector('#previous-button') || 
                        document.querySelector('tp-yt-paper-icon-button.previous-button') ||
                        document.querySelector('[aria-label*="Previous"]') ||
                        document.querySelector('[aria-label*="Prev"]');
            if (btn) {
                btn.click();
            }
            setTimeout(updateState, 50);
        });
        document.getElementById('ctrl-next')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const btn = document.querySelector('.next-button') || 
                        document.querySelector('#next-button') || 
                        document.querySelector('tp-yt-paper-icon-button.next-button') ||
                        document.querySelector('[aria-label*="Next"]');
            if (btn) {
                btn.click();
            }
            setTimeout(updateState, 50);
        });
        document.getElementById('ctrl-play-pause')?.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelector('#play-pause-button')?.click();
            setTimeout(updateState, 50);
        });
        document.getElementById('ctrl-minimize')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else {
                document.querySelector('tp-yt-paper-icon-button.ytmusic-player-page')?.click();
            }
        });

        // Seek Drag & Click Handler
        const progressContainer = document.getElementById('progress-container');
        if (progressContainer) {
            const handleProgressMove = (e) => {
                const rect = progressContainer.getBoundingClientRect();
                let percent = (e.clientX - rect.left) / rect.width;
                percent = Math.max(0, Math.min(1, percent));
                
                const video = document.querySelector('video');
                const progressBar = document.querySelector('#progress-bar.ytmusic-player-bar');
                
                if (video && video.duration) {
                    video.currentTime = percent * video.duration;
                    document.getElementById('time-current').innerText = formatTime(video.currentTime);
                    document.getElementById('time-total').innerText = formatTime(video.duration);
                } else if (progressBar) {
                    progressBar.value = percent * progressBar.max;
                    progressBar.dispatchEvent(new Event('change'));
                }
                
                const progressFill = document.getElementById('progress-fill');
                if (progressFill) progressFill.style.width = `${percent * 100}%`;
            };

            progressContainer.addEventListener('mousedown', (e) => {
                e.preventDefault();
                state.isDraggingProgress = true;
                handleProgressMove(e);
            });

            window.addEventListener('mousemove', (e) => {
                if (state.isDraggingProgress) {
                    handleProgressMove(e);
                }
            });

            window.addEventListener('mouseup', () => {
                if (state.isDraggingProgress) {
                    state.isDraggingProgress = false;
                    updateState();
                }
            });
        }

        // Volume Drag & Click Handler
        const volumeContainer = document.getElementById('volume-container');
        if (volumeContainer) {
            const handleVolumeMove = (e) => {
                const video = document.querySelector('video');
                const bar = volumeContainer.querySelector('.dashboard-volume-bar');
                if (bar) {
                    const rect = bar.getBoundingClientRect();
                    let percent = (e.clientX - rect.left) / rect.width;
                    percent = Math.max(0, Math.min(1, percent));
                    
                    if (video) {
                        video.volume = percent;
                        if (video.muted && percent > 0) video.muted = false;
                    }
                    const volumeSlider = document.querySelector('#volume-slider');
                    if (volumeSlider) volumeSlider.value = percent * 100;
                    
                    const volumeFill = document.getElementById('volume-fill');
                    if (volumeFill) volumeFill.style.width = `${percent * 100}%`;
                }
            };

            volumeContainer.addEventListener('mousedown', (e) => {
                if (e.target.closest('.volume-icon')) {
                    e.stopPropagation();
                    const video = document.querySelector('video');
                    if (video) video.muted = !video.muted;
                    const muteBtn = document.querySelector('.volume.ytmusic-player-bar tp-yt-paper-icon-button') || 
                                    document.querySelector('.volume.ytmusic-player-bar');
                    muteBtn?.click();
                    updateState();
                    return;
                }

                e.preventDefault();
                state.isDraggingVolume = true;
                handleVolumeMove(e);
            });

            window.addEventListener('mousemove', (e) => {
                if (state.isDraggingVolume) {
                    handleVolumeMove(e);
                }
            });

            window.addEventListener('mouseup', () => {
                if (state.isDraggingVolume) {
                    state.isDraggingVolume = false;
                    updateState();
                }
            });
        }

        // Direct media event listeners for instant video updates
        const attachVideoEvents = () => {
            const video = document.querySelector('video');
            if (video && !video.hasAttribute('dashboard-bound')) {
                video.setAttribute('dashboard-bound', 'true');
                ['timeupdate', 'volumechange', 'play', 'pause', 'seeking', 'seeked'].forEach(evt => {
                    video.addEventListener(evt, updateState);
                });
            }
        };
        attachVideoEvents();
        setInterval(attachVideoEvents, 2000);
    }

    function getThumbnailFromItem(itemNode) {
        if (!itemNode) return '';

        // Check Polymer data object if DOM img is lazy-loaded or not yet rendered
        const polyData = itemNode.data || itemNode.__data?.data || itemNode.__data;
        if (polyData) {
            const thumbs = polyData.thumbnail?.thumbnails || 
                           polyData.musicItemRenderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
            if (Array.isArray(thumbs) && thumbs.length > 0) {
                const url = thumbs[thumbs.length - 1]?.url;
                if (url) return url.replace(/=w\d+-h\d+/, '=w120-h120');
            }
        }

        // DOM element fallbacks
        const shadow = itemNode.querySelector('yt-img-shadow');
        const imgEl = itemNode.querySelector('img#img') || itemNode.querySelector('img');
        
        let src = shadow?.getAttribute('src') || shadow?.src || shadow?.currentSrc ||
                  imgEl?.src || imgEl?.getAttribute('src') || imgEl?.dataset?.src || '';

        if (src && !src.startsWith('data:image')) {
            return src.replace(/=w\d+-h\d+/, '=w120-h120');
        }
        return '';
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
        const rawTitle = document.querySelector('ytmusic-player-bar .title')?.innerText || '...';
        const rawArtist = document.querySelector('ytmusic-player-bar .byline')?.innerText || '...';
        
        const title = rawTitle.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
        const artist = rawArtist.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

        document.querySelector('.dashboard-title').innerText = title;
        document.querySelector('.dashboard-artist').innerText = artist;

        // 3. PROGRESS SYNC
        const video = document.querySelector('video');
        if (!state.isDraggingProgress) {
            if (video && !isNaN(video.duration) && video.duration > 0) {
                const progress = (video.currentTime / video.duration) * 100;
                document.getElementById('progress-fill').style.width = `${progress}%`;
                document.getElementById('time-current').innerText = formatTime(video.currentTime);
                document.getElementById('time-total').innerText = formatTime(video.duration);
            } else {
                const progressBar = document.querySelector('#progress-bar.ytmusic-player-bar');
                if (progressBar) {
                    const progress = (progressBar.value / progressBar.max) * 100;
                    document.getElementById('progress-fill').style.width = `${progress}%`;
                }
                const timeInfo = document.querySelector('.time-info.ytmusic-player-bar')?.innerText || '';
                if (timeInfo) {
                    const parts = timeInfo.split('/').map(s => s.trim());
                    if (parts.length === 2) {
                        document.getElementById('time-current').innerText = parts[0];
                        document.getElementById('time-total').innerText = parts[1];
                    }
                }
            }
        }

        // 4. PLAY/PAUSE STATE
        const isPlaying = document.querySelector('#play-pause-button')?.getAttribute('aria-label') === 'Pause';
        document.getElementById('play-icon').style.display = isPlaying ? 'none' : 'block';
        document.getElementById('pause-icon').style.display = isPlaying ? 'block' : 'none';

        // 5. IMPROVED UP NEXT EXTRACTION WITH CONSOLE LOGGING
        const queueContainer = document.querySelector('ytmusic-player-queue') || document;
        const queueItems = Array.from(queueContainer.querySelectorAll('ytmusic-player-queue-item'));
        const rawCurrentTitle = document.querySelector('ytmusic-player-bar .title')?.innerText || '';
        const currentTitle = rawCurrentTitle.trim().toLowerCase();

        let currentIndex = -1;

        if (currentTitle) {
            // Priority 1: Title matches AND item is marked selected/playing
            currentIndex = queueItems.findIndex(item => {
                const itemTitle = (item.querySelector('.song-title')?.innerText || 
                                    item.querySelector('.title')?.innerText || 
                                    item.querySelector('yt-formatted-string')?.innerText || '').trim().toLowerCase();
                if (!itemTitle) return false;
                const isTitleMatch = itemTitle === currentTitle || itemTitle.includes(currentTitle) || currentTitle.includes(itemTitle);
                if (!isTitleMatch) return false;

                return item.hasAttribute('selected') || item.hasAttribute('playing') || item.classList.contains('selected') ||
                       item.getAttribute('play-button-state') === 'playing' || item.querySelector('[icon="volume-up"]');
            });

            // Priority 2: Title matches current song title (regardless of attributes)
            if (currentIndex === -1) {
                currentIndex = queueItems.findIndex(item => {
                    const itemTitle = (item.querySelector('.song-title')?.innerText || 
                                        item.querySelector('.title')?.innerText || 
                                        item.querySelector('yt-formatted-string')?.innerText || '').trim().toLowerCase();
                    return itemTitle && (itemTitle === currentTitle || itemTitle.includes(currentTitle) || currentTitle.includes(itemTitle));
                });
            }
        }

        // Priority 3: Fallback attribute check if title is empty
        if (currentIndex === -1) {
            currentIndex = queueItems.findIndex(item => {
                if (item.hasAttribute('selected') || item.hasAttribute('playing') || item.classList.contains('selected')) return true;
                if (item.getAttribute('play-button-state') === 'playing' || item.getAttribute('play-button-state') === 'PAUSED') return true;
                if (item.querySelector('[icon="volume-up"]') || item.querySelector('.play-button[state="playing"]')) return true;
                return false;
            });
        }


        let upNextItem = null;
        let nextTitle = '';
        let nextThumb = '';

        if (currentIndex !== -1) {
            for (let i = currentIndex + 1; i < queueItems.length; i++) {
                const candidate = queueItems[i];
                const candTitle = (candidate.querySelector('.song-title')?.innerText || 
                                   candidate.querySelector('.title')?.innerText || 
                                   candidate.querySelector('yt-formatted-string')?.innerText || '').trim();
                
                // Skip duplicate node of currently playing song if present
                if (candTitle && candTitle !== '...' && candTitle.toLowerCase() !== currentTitle) {
                    upNextItem = candidate;
                    nextTitle = candTitle;
                    break;
                }
            }
            if (!upNextItem && currentIndex + 1 < queueItems.length) {
                upNextItem = queueItems[currentIndex + 1];
                nextTitle = (upNextItem.querySelector('.song-title')?.innerText || 
                             upNextItem.querySelector('.title')?.innerText || '').trim();
            }
        }

        if (upNextItem) {
            nextThumb = getThumbnailFromItem(upNextItem);
        }

        // Console log debug info when track or upnext changes
        if (state.lastTrackId !== rawCurrentTitle) {
            state.lastTrackId = rawCurrentTitle;
            console.log('[Spotify Dashboard Debug]', {
                currentTitle: rawCurrentTitle,
                totalQueueItems: queueItems.length,
                matchedIndex: currentIndex,
                detectedNextTitle: nextTitle || 'None',
                nextThumbUrl: nextThumb || 'None'
            });
        }

        if (nextTitle && nextTitle !== '...' && nextTitle !== '') {
            document.getElementById('upnext-title').innerText = nextTitle;
            if (nextThumb) {
                document.getElementById('upnext-thumb').style.backgroundImage = `url("${nextThumb}")`;
            }
            document.getElementById('dashboard-upnext').style.display = 'flex';
        } else {
            document.getElementById('dashboard-upnext').style.display = 'none';
        }

        // 6. PLAYLIST CONTEXT
        const playlistName = document.querySelector('ytmusic-player-page .title.ytmusic-metadata-renderer')?.innerText 
                          || document.querySelector('ytmusic-player-queue #header .title')?.innerText
                          || 'Your Library';
        document.querySelector('.dashboard-playlist-name').innerText = playlistName;

        // 7. VOLUME SYNC
        if (!state.isDraggingVolume) {
            if (video) {
                const volumeVal = video.muted ? 0 : video.volume * 100;
                document.getElementById('volume-fill').style.width = `${volumeVal}%`;
            } else {
                const volumeSlider = document.querySelector('#volume-slider');
                if (volumeSlider) {
                    const volumeVal = volumeSlider.value;
                    document.getElementById('volume-fill').style.width = `${volumeVal}%`;
                }
            }
        }
    }

    // 5. Pulse Update
    init();
    setInterval(updateState, 100);

    // Font injection
    if (!document.getElementById('spotify-font-link')) {
        const link = document.createElement('link');
        link.id = 'spotify-font-link';
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap';
        document.head.appendChild(link);
    }

})();
