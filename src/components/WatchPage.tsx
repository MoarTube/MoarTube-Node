import React from 'react';

export interface WatchPageProps {
  model: {
    informationData: {
      isError: false;
      information: {
        nodeVideoCount: number;
        nodeId: string;
        nodeName: string;
        nodeAbout: string;
        publicNodeProtocol: string;
        publicNodeAddress: string;
        publicNodePort: string;
        cloudflareTurnstileSiteKey: string;
      };
    };
    videoData: {
      isError: false;
      video: {
        videoId: string;
        title: string;
        description: string | null;
        tags: string | null;
        views: number;
        likes: number;
        dislikes: number;
        isPublished: boolean;
        isStreaming: boolean;
        isStreamed: boolean;
        isCommentsEnabled: boolean;
        isReportsEnabled: boolean;
        creationTimestamp: number;
        isHlsAvailable: boolean;
        isMp4Available: boolean;
        isWebmAvailable: boolean;
        isOgvAvailable: boolean;
        adaptiveSources: any[];
        progressiveSources: any[];
        sourcesFormatsAndResolutions: any;
      };
    };
    recommendedVideosData: {
      isError: false;
      recommendedVideos: any[];
    };
    commentsData: {
      isError: false;
      comments: any[];
    };
    externalVideosBaseUrl: string;
    externalResourcesBaseUrl: string;
  };
  hotReloadScript?: string;
}

export const WatchPage: React.FC<WatchPageProps> = ({ model, hotReloadScript }) => {
  const { videoData, informationData, recommendedVideosData, commentsData } = model;

  return (
    <html>
      <head>
        <title>{videoData.video.title || 'MoarTube Video'}</title>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <div id="app">
          <h1>{informationData.information.nodeName} - Moarrr1311222xxqqq11d111s11sssxTube</h1>
          <h2>{videoData.video.title}</h2>
          {videoData.video.description && <p>{videoData.video.description}</p>}
          <div>
            <video controls style={{ width: '100%', maxWidth: '800px' }}>
              <source src={`${model.videoData.video.adaptiveSources[0].src}`} type={`${model.videoData.video.adaptiveSources[0].type}`} />
              Your browser does not support the video tag.
            </video>
          </div>
          <p>Views: {videoData.video.views}</p>
          <p>Likes: {videoData.video.likes} | Dislikes: {videoData.video.dislikes}</p>

          <h3>Recommzzz111ended Videos</h3>
          <ul>
            {recommendedVideosData.recommendedVideos.slice(0, 5).map((video: any) => (
              <li key={video.videoId}>
                <a href={`/watch?v=${video.videoId}`}>{video.title}</a>
              </li>
            ))}
          </ul>

          <h3>Comments ({commentsData.comments.length})</h3>
          <ul>
            {commentsData.comments.slice(0, 10).map((comment: any) => (
              <li key={comment.commentId}>
                {comment.commentPlainTextSanitized}
              </li>
            ))}
          </ul>
        </div>
        {hotReloadScript && <div dangerouslySetInnerHTML={{ __html: hotReloadScript }} />}
      </body>
    </html>
  );
};