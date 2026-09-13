import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { CurrentAuth } from '../../common/decorators/current-auth.decorator';
import { OrgGuard } from '../../common/guards/org.guard';
import { StorageService } from '../storage/storage.service';
import { DocumentsService } from './documents.service';

class CreateUrlDto {
  @IsString() url!: string;
  @IsOptional() @IsString() filename?: string;
}

@ApiTags('documents')
@UseGuards(OrgGuard)
@Controller({ path: 'organizations/:orgId/documents', version: '1' })
export class DocumentsController {
  constructor(
    private docs: DocumentsService,
    private storage: StorageService,
  ) {}

  @Get()
  list(@Param('orgId') orgId: string) {
    return this.docs.list(orgId);
  }

  @Get(':docId/status')
  status(@Param('orgId') orgId: string, @Param('docId') docId: string) {
    return this.docs.getStatusForOrg(orgId, docId);
  }

  @Delete(':docId')
  @HttpCode(HttpStatus.OK)
  remove(
    @Param('orgId') orgId: string,
    @Param('docId') docId: string,
    @CurrentAuth() auth: { userId: string },
  ) {
    return this.docs.remove(orgId, docId, auth.userId);
  }

  // Multer defaults to memory storage → file.buffer is available.
  // Persist to disk first so the ingestion worker can read + parse it.
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async upload(
    @Param('orgId') orgId: string,
    @CurrentAuth() auth: { userId: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded (multipart field name must be "file")');
    const storageKey = await this.storage.save(orgId, file.originalname, file.buffer);
    return this.docs.createFromUpload(orgId, auth.userId, {
      filename: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      storageKey,
    });
  }

  @Post('from-url')
  async fromUrl(
    @Param('orgId') orgId: string,
    @CurrentAuth() auth: { userId: string },
    @Body() dto: CreateUrlDto,
  ) {
    let res: Response;
    try {
      res = await fetch(dto.url);
    } catch {
      throw new BadRequestException(`Could not fetch URL: ${dto.url}`);
    }
    if (!res.ok) throw new BadRequestException(`URL fetch failed with status ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.length) throw new BadRequestException('URL returned an empty body');
    const filename = dto.filename ?? dto.url.split('/').pop() ?? 'document';
    const storageKey = await this.storage.save(orgId, filename, buffer);
    return this.docs.createFromUpload(orgId, auth.userId, {
      filename,
      mimeType: res.headers.get('content-type') ?? 'application/octet-stream',
      size: buffer.length,
      storageKey,
    });
  }
}
