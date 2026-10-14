import { jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import { ImportsController } from './imports.controller';

describe('ImportsController historical auto-commit guard', () => {
  const originalSecret = process.env.AUTO_HISTORICAL_IMPORT_SECRET;
  const importsService = {
    autoCommitHistoricalImport: jest.fn(),
  } as any;
  let controller: ImportsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ImportsController(importsService);
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.AUTO_HISTORICAL_IMPORT_SECRET;
    } else {
      process.env.AUTO_HISTORICAL_IMPORT_SECRET = originalSecret;
    }
  });

  it('fails closed when the server secret and request header are both missing', () => {
    delete process.env.AUTO_HISTORICAL_IMPORT_SECRET;

    expect(() =>
      controller.autoCommitHistorical({ headers: {} } as any),
    ).toThrow(ForbiddenException);
    expect(importsService.autoCommitHistoricalImport).not.toHaveBeenCalled();
  });

  it('rejects a missing or incorrect request secret', () => {
    process.env.AUTO_HISTORICAL_IMPORT_SECRET = 'configured-secret';

    expect(() =>
      controller.autoCommitHistorical({ headers: {} } as any),
    ).toThrow(ForbiddenException);
    expect(() =>
      controller.autoCommitHistorical({
        headers: { 'x-historical-import-secret': 'wrong-secret' },
      } as any),
    ).toThrow(ForbiddenException);
    expect(importsService.autoCommitHistoricalImport).not.toHaveBeenCalled();
  });

  it('allows the request only when the configured secret matches', async () => {
    process.env.AUTO_HISTORICAL_IMPORT_SECRET = 'configured-secret';
    importsService.autoCommitHistoricalImport.mockResolvedValue({ success: true });
    const request = {
      headers: { 'x-historical-import-secret': 'configured-secret' },
    } as any;

    await expect(controller.autoCommitHistorical(request)).resolves.toEqual({
      success: true,
    });
    expect(importsService.autoCommitHistoricalImport).toHaveBeenCalledWith(request);
  });
});
