import { load } from 'cheerio';

interface RoomIdResult {
    success: boolean;
    roomId: string;
    channelId: string; // The unique ID of the user/channel
}

/**
 * Gets the roomId and channelId of an active live.
 */
export async function getRoomId(username: string): Promise<RoomIdResult> {
    const user = username.replace(/^@/, '');
    const url = `https://www.tiktok.com/@${user}/live`;

    try {
        const res = await fetch(url, {
            headers: {
                // User-Agent is critical for TikTok to return the state JSON
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        });

        // 1. Detection by redirection (if not in live, TikTok usually redirects to profile)
        if (res.redirected && !res.url.includes('/live')) {
            return { success: false, roomId: '', channelId: '' };
        }

        const html = await res.text();
        const $ = load(html);

        // 2. Extraction via state JSON (More reliable method)
        const scriptData = $('#SIGI_STATE').html() || $('#__UNIVERSAL_DATA_FOR_REHYDRATION__').html();
        
        if (scriptData) {
            try {
                const json = JSON.parse(scriptData);
                
                // Structure for SIGI_STATE (Desktop)
                const liveRoom = json.LiveRoom?.liveRoomUserInfo;
                if (liveRoom) {
                    return {
                        success: liveRoom.user.status === 2, // 2 usually indicates "live"
                        roomId: liveRoom.user.roomId || '',
                        channelId: liveRoom.user.id || ''
                    };
                }
            } catch (e) {
                console.error("Error parsing TikTok JSON");
            }
        }

        // 3. Fallback: Meta Tags (For channelId and roomId)
        const roomId = 
            $('meta[property="al:android:url"]').attr('content')?.match(/room_id=(\d+)/)?.[1] ||
            $('meta[property="og:url"]').attr('content')?.match(/\/live\/(\d+)/)?.[1] || '';

        // channelId is usually in the shop URL or in the twitter meta
        const channelId = 
            $('meta[name="twitter:app:url:iphone"]').attr('content')?.match(/user\/(\d+)/)?.[1] || 
            $('meta[property="al:ios:url"]').attr('content')?.match(/user\/(\d+)/)?.[1] || '';

        return {
            success: roomId !== '',
            roomId,
            channelId
        };

    } catch (error) {
        console.error("Error in getRoomId:", error);
        return { success: false, roomId: '', channelId: '' };
    }
}