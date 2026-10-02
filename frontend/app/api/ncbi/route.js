import { NextResponse } from 'next/server';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { execSync } from 'child_process';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  // Dynamically fetch the live proxy from the shell, bypassing stale process.env
  let liveProxyUrl = '';
  try {
    const envOutput = execSync('env | grep -i -E "https?_proxy"').toString();
    const match = envOutput.match(/(?:https?_proxy)=([^\n]+)/i);
    if (match && match[1]) {
        liveProxyUrl = match[1].trim();
    }
  } catch (e) {
    console.warn("Failed to fetch dynamic proxy", e.message);
  }

  // Fallback to Next.js process.env if the bash trick fails (requires server restart if port rotated)
  if (!liveProxyUrl) {
    liveProxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || '';
  }
  
  const httpsAgent = liveProxyUrl ? new HttpsProxyAgent(liveProxyUrl, { rejectUnauthorized: false }) : undefined;

  if (!targetUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    // Only allow NCBI and EBI URLs for security
    const urlObj = new URL(targetUrl);
    const hostname = urlObj.hostname;
    
    if (!hostname.endsWith('ncbi.nlm.nih.gov') && !hostname.endsWith('ebi.ac.uk')) {
      return NextResponse.json({ error: 'Unauthorized URL' }, { status: 403 });
    }

    const response = await axios.get(targetUrl, {
      responseType: 'arraybuffer', // Get raw bytes to support text, xml, and binary (gz)
      validateStatus: () => true, // Don't throw on 4xx/5xx
      httpsAgent, // Attach the proxy agent
      proxy: false, // Force axios to use httpsAgent instead of its own proxy logic
      timeout: 30000 // 30 second timeout to prevent ETIMEDOUT hanging
    });

    if (response.status >= 400) {
      return NextResponse.json(
        { error: `Upstream responded with ${response.status}` },
        { status: response.status }
      );
    }

    const contentType = response.headers['content-type'] || '';
    
    if (contentType.includes('application/json')) {
      // Axios returns arraybuffer, we decode it
      const text = new TextDecoder().decode(response.data);
      return NextResponse.json(JSON.parse(text));
    } else {
      return new NextResponse(response.data, {
        headers: { 
          'Content-Type': contentType,
          'Content-Length': response.data.byteLength.toString()
        }
      });
    }
  } catch (error) {
    console.error('API Route Proxy Error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch upstream resource', details: error.message }, { status: 500 });
  }
}
